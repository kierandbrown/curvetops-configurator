import { CartSpecification } from './specificationTypes';

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '—';
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const openSpecificationPrintView = (spec: CartSpecification) => {
  const printWindow = window.open('', '_blank', 'noopener');
  if (!printWindow) return;

  const expectedCommission =
    spec.commissionDue != null
      ? spec.commissionDue
      : spec.convertedOrderValue != null
        ? spec.convertedOrderValue * spec.commissionRate
        : null;

  const lineItems = spec.items
    .map(item => {
      const dimensions = `${item.config.lengthMm} × ${item.config.widthMm} mm`;
      return `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${escapeHtml(item.selectedColour?.name || 'Not selected')}</td>
          <td>${escapeHtml(item.selectedColour?.finish || '—')}</td>
          <td>${escapeHtml(item.config.shape)}</td>
          <td>${dimensions}</td>
          <td>${item.config.quantity}</td>
          <td>${formatCurrency(item.estimatedPrice)}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(spec.jobName)} – Top specification</title>
        <style>
          body { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #0f172a; }
          h1 { margin-bottom: 4px; }
          h2 { margin: 24px 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: left; }
          th { background: #e2e8f0; }
          .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
          .pill { display: inline-block; padding: 6px 10px; border-radius: 9999px; background: #ecfeff; color: #0f172a; font-size: 12px; border: 1px solid #a5f3fc; }
        </style>
      </head>
      <body>
        <header>
          <p class="pill">${spec.status.toUpperCase()}</p>
          <h1>${escapeHtml(spec.jobName)}</h1>
          <p>${escapeHtml(spec.jobAddress || 'No address supplied')}</p>
        </header>

        <section class="meta-grid">
          <div>
            <h2>Specifier</h2>
            <p><strong>Name:</strong> ${escapeHtml(spec.specifierName || '—')}</p>
            <p><strong>Company:</strong> ${escapeHtml(spec.specifierCompany || '—')}</p>
          </div>
          <div>
            <h2>Buyer</h2>
            <p><strong>Contact:</strong> ${escapeHtml(spec.buyerName || '—')}</p>
            <p><strong>Organisation:</strong> ${escapeHtml(spec.buyerCompany || '—')}</p>
          </div>
          <div>
            <h2>Commercials</h2>
            <p><strong>Estimated total:</strong> ${formatCurrency(spec.totalEstimatedValue)}</p>
            <p><strong>Commission rate:</strong> ${(spec.commissionRate * 100).toFixed(1)}%</p>
            <p><strong>Expected commission:</strong> ${formatCurrency(expectedCommission)}</p>
          </div>
        </section>

        ${spec.notes ? `<section><h2>Notes</h2><p>${escapeHtml(spec.notes)}</p></section>` : ''}

        <section>
          <h2>Table tops (${spec.items.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Material</th>
                <th>Finish</th>
                <th>Shape</th>
                <th>Dimensions</th>
                <th>Qty</th>
                <th>Estimated value</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems}
            </tbody>
          </table>
        </section>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};
