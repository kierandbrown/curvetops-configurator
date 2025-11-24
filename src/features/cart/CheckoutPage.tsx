import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_COUNTRY, useAuth } from '@auth/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@auth/firebase';

interface AddressForm {
  contactName: string;
  companyName: string;
  streetAddress: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
}

interface FreightQuote {
  baseLinehaul: number;
  stateAdjustment: number;
  forkliftSurcharge: number;
  remoteSurcharge: number;
  total: number;
  notes: string[];
}

interface PaymentForm {
  cardholderName: string;
  email: string;
  phoneNumber: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
  saveForLater: boolean;
}

const stateAdjustments: Record<string, number> = {
  ACT: 25,
  NSW: 35,
  VIC: 30,
  QLD: 70,
  SA: 60,
  WA: 120,
  TAS: 80,
  NT: 160
};

const FORKLIFT_SURCHARGE = 85;
const BASE_LINEHAUL = 120;
const ORIGIN_CITY = 'Queanbeyan';
const ORIGIN_STATE = 'NSW';

const normaliseState = (value: string) => value.trim().toUpperCase();

const isAustralianAddress = (country: string) => country.trim().toLowerCase() === 'australia';

const calculateRemoteSurcharge = (stateCode: string, postalCode: string) => {
  const numericPostcode = Number.parseInt(postalCode.slice(0, 4), 10);

  if (!Number.isFinite(numericPostcode)) {
    return 0;
  }

  // Treat long haul regions and sparsely serviced areas as remote.
  if (numericPostcode < 200 || numericPostcode >= 8000) {
    return 160;
  }

  if (stateCode === 'WA' && numericPostcode >= 6200) {
    return 110;
  }

  if (stateCode === 'QLD' && numericPostcode >= 4700) {
    return 90;
  }

  if (stateCode === 'SA' && numericPostcode >= 5200) {
    return 70;
  }

  if (stateCode === 'TAS' && numericPostcode >= 7200) {
    return 60;
  }

  return 0;
};

const buildFreightQuote = (address: AddressForm): FreightQuote => {
  if (!isAustralianAddress(address.country)) {
    throw new Error('Delivery is limited to Australia.');
  }

  const stateCode = normaliseState(address.stateProvince);
  const stateAdjustment = stateAdjustments[stateCode] ?? 90;
  const remoteSurcharge = calculateRemoteSurcharge(stateCode, address.postalCode);

  const total = BASE_LINEHAUL + stateAdjustment + FORKLIFT_SURCHARGE + remoteSurcharge;

  const notes = [
    `Deliver to: ${address.contactName || 'Add a contact'} — ${address.companyName || 'Add a company name'}`,
    `Sending from ${ORIGIN_CITY}, ${ORIGIN_STATE} (calculated ex-warehouse)`,
    `Base linehaul: ${BASE_LINEHAUL.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}`,
    `State adjustment (${stateCode || 'unknown'}): ${stateAdjustment.toLocaleString('en-AU', {
      style: 'currency',
      currency: 'AUD'
    })}`,
    `Forklift load (oversized items): ${FORKLIFT_SURCHARGE.toLocaleString('en-AU', {
      style: 'currency',
      currency: 'AUD'
    })}`
  ];

  if (remoteSurcharge > 0) {
    notes.push(
      `Remote / regional uplift: ${remoteSurcharge.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}`
    );
  }

  notes.push(
    `Estimated freight total: ${total.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}`
  );

  return {
    baseLinehaul: BASE_LINEHAUL,
    stateAdjustment,
    forkliftSurcharge: FORKLIFT_SURCHARGE,
    remoteSurcharge,
    total,
    notes
  };
};

const CheckoutPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [addressForm, setAddressForm] = useState<AddressForm>({
    contactName: '',
    companyName: '',
    streetAddress: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: DEFAULT_COUNTRY
  });
  const [freightQuote, setFreightQuote] = useState<FreightQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    cardholderName: '',
    email: '',
    phoneNumber: '',
    cardNumber: '',
    expiry: '',
    cvc: '',
    saveForLater: true
  });
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [creatingCheckoutSession, setCreatingCheckoutSession] = useState(false);

  useEffect(() => {
    if (!profile) return;

    setAddressForm(prev => ({
      ...prev,
      contactName: `${profile.firstName} ${profile.lastName}`.trim(),
      companyName: profile.companyName,
      streetAddress: profile.streetAddress,
      city: profile.city,
      stateProvince: profile.stateProvince,
      postalCode: profile.postalCode,
      country: profile.country || DEFAULT_COUNTRY
    }));

    setPaymentForm(prev => ({
      ...prev,
      cardholderName: `${profile.firstName} ${profile.lastName}`.trim(),
      email: profile.email,
      phoneNumber: profile.phoneNumber
    }));
  }, [profile]);

  const deliverySummary = useMemo(() => {
    if (!freightQuote) return null;

    return freightQuote.notes.map(note => (
      <li key={note} className="text-sm text-slate-300">
        {note}
      </li>
    ));
  }, [freightQuote]);

  const handleAddressChange = (field: keyof AddressForm, value: string) => {
    setAddressForm(prev => ({ ...prev, [field]: value }));
  };

  const handlePaymentChange = <Key extends keyof PaymentForm>(field: Key, value: PaymentForm[Key]) => {
    setPaymentForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCalculateFreight = (event: FormEvent) => {
    event.preventDefault();

    try {
      const quote = buildFreightQuote(addressForm);
      setFreightQuote(quote);
      setQuoteError(null);
      setPaymentStatus(null);
    } catch (error: unknown) {
      setFreightQuote(null);
      setQuoteError(error instanceof Error ? error.message : 'Unable to calculate freight.');
    }
  };

  const handleConfirmPayment = async (event: FormEvent) => {
    event.preventDefault();

    if (!freightQuote) {
      setPaymentStatus('Calculate delivery before confirming payment.');
      return;
    }

    const { total } = freightQuote;

    setCreatingCheckoutSession(true);
    setPaymentStatus('Contacting Stripe to start a secure checkout...');

    try {
      const createSession = httpsCallable<any, { url?: string }>(
        functions,
        'createCheckoutSession'
      );

      const response = await createSession({
        amount: total,
        currency: 'aud',
        returnUrl: `${window.location.origin}/orders`
      });

      const checkoutUrl = response.data?.url;

      if (!checkoutUrl) {
        setPaymentStatus('Stripe did not return a checkout URL. Please try again.');
        return;
      }

      setPaymentStatus('Redirecting to Stripe Checkout...');
      window.location.assign(checkoutUrl);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to start Stripe Checkout. Please try again.';
      setPaymentStatus(message);
    } finally {
      setCreatingCheckoutSession(false);
    }
  };

  const handleGooglePay = () => {
    if (!freightQuote) {
      setPaymentStatus('Calculate delivery before starting Google Pay.');
      return;
    }

    setPaymentStatus('Google Pay is ready to confirm with the saved shipping and freight total.');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Checkout</p>
          <h1 className="text-xl font-semibold text-slate-50">Delivery and payment</h1>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs text-slate-500" aria-label="Breadcrumb">
          <button
            type="button"
            onClick={() => navigate('/cart')}
            className="text-slate-400 underline-offset-2 hover:underline"
          >
            Cart
          </button>
          <span aria-hidden="true">/</span>
          <span className="text-slate-200">Checkout</span>
        </nav>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleCalculateFreight}
          className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950 p-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">Delivery</p>
              <h2 className="text-lg font-semibold text-slate-50">Address for freight</h2>
              <p className="text-sm text-slate-400">Defaults to your saved account details. Delivery is limited to Australia.</p>
            </div>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-300">
              Forklift load
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-contact">
              Delivery contact name
              <input
                id="checkout-contact"
                value={addressForm.contactName}
                onChange={e => handleAddressChange('contactName', e.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="Person receiving the order"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-company">
              Company name
              <input
                id="checkout-company"
                value={addressForm.companyName}
                onChange={e => handleAddressChange('companyName', e.target.value)}
                autoComplete="organization"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="Business receiving delivery"
                required
              />
            </label>

            <label className="md:col-span-2 text-sm font-medium text-slate-200" htmlFor="checkout-street">
              Street address
              <input
                id="checkout-street"
                value={addressForm.streetAddress}
                onChange={e => handleAddressChange('streetAddress', e.target.value)}
                autoComplete="street-address"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-city">
              City / Suburb
              <input
                id="checkout-city"
                value={addressForm.city}
                onChange={e => handleAddressChange('city', e.target.value)}
                autoComplete="address-level2"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-state">
              State / Territory
              <input
                id="checkout-state"
                value={addressForm.stateProvince}
                onChange={e => handleAddressChange('stateProvince', e.target.value)}
                autoComplete="address-level1"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-postcode">
              Postcode
              <input
                id="checkout-postcode"
                value={addressForm.postalCode}
                onChange={e => handleAddressChange('postalCode', e.target.value)}
                autoComplete="postal-code"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-country">
              Country
              <input
                id="checkout-country"
                value={addressForm.country}
                onChange={e => handleAddressChange('country', e.target.value)}
                autoComplete="country"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                required
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            <p className="font-semibold text-slate-100">Freight assumptions</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>All items are oversized and loaded with a forklift.</li>
              <li>Delivery is available only within Australia.</li>
              <li>Quotes are calculated from Queanbeyan, NSW to your destination.</li>
              <li>Remote postcodes attract additional uplift on top of the state adjustment.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              {quoteError ? <span className="text-red-300">{quoteError}</span> : 'Calculate to reveal your freight total.'}
            </div>
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Calculate delivery
            </button>
          </div>

          {freightQuote && (
            <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-emerald-200">Freight estimate</p>
                <p className="text-lg font-bold text-emerald-300">
                  {freightQuote.total.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}
                </p>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-emerald-100">{deliverySummary}</ul>
            </div>
          )}
        </form>

        <form
          onSubmit={handleConfirmPayment}
          className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950 p-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">Payment</p>
              <h2 className="text-lg font-semibold text-slate-50">Billing details</h2>
              <p className="text-sm text-slate-400">
                Browsers can auto-fill saved cards to speed things up. Google Pay is available after the delivery quote.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2 text-sm font-medium text-slate-200" htmlFor="checkout-cardholder">
              Name on card
              <input
                id="checkout-cardholder"
                value={paymentForm.cardholderName}
                onChange={e => handlePaymentChange('cardholderName', e.target.value)}
                autoComplete="cc-name"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="As printed on the card"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-email">
              Receipt email
              <input
                id="checkout-email"
                type="email"
                value={paymentForm.email}
                onChange={e => handlePaymentChange('email', e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-phone">
              Contact number
              <input
                id="checkout-phone"
                type="tel"
                value={paymentForm.phoneNumber}
                onChange={e => handlePaymentChange('phoneNumber', e.target.value)}
                autoComplete="tel"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-card-number">
              Card number
              <input
                id="checkout-card-number"
                value={paymentForm.cardNumber}
                onChange={e => handlePaymentChange('cardNumber', e.target.value)}
                autoComplete="cc-number"
                inputMode="numeric"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="1234 5678 9012 3456"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-expiry">
              Expiry
              <input
                id="checkout-expiry"
                value={paymentForm.expiry}
                onChange={e => handlePaymentChange('expiry', e.target.value)}
                autoComplete="cc-exp"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="MM / YY"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-200" htmlFor="checkout-cvc">
              CVC
              <input
                id="checkout-cvc"
                value={paymentForm.cvc}
                onChange={e => handlePaymentChange('cvc', e.target.value)}
                autoComplete="cc-csc"
                inputMode="numeric"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="123"
                required
              />
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-200" htmlFor="checkout-save-card">
              <input
                id="checkout-save-card"
                type="checkbox"
                checked={paymentForm.saveForLater}
                onChange={e => handlePaymentChange('saveForLater', e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
              />
              Allow this device to suggest the card next time
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">{paymentStatus || 'Freight must be calculated before paying.'}</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGooglePay}
                disabled={!freightQuote}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
              >
                Google Pay
              </button>
              <button
                type="submit"
                disabled={creatingCheckoutSession}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                {creatingCheckoutSession ? 'Starting Stripe checkout...' : 'Confirm payment'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
};

export default CheckoutPage;
