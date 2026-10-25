const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );

export function toCsv(headers, rows) {
  const cell = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}`;
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printReport({ title, subtitle = '', sections }) {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    throw new Error('Allow pop-ups to open the report, then choose Save as PDF.');
  }
  const sectionHtml = sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.title)}</h2>
          ${
            section.rows
              ? `<div class="table-wrap"><table><thead><tr>${section.headers
                  .map((header) => `<th>${escapeHtml(header)}</th>`)
                  .join('')}</tr></thead><tbody>${section.rows
                  .map(
                    (row) =>
                      `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : `<p>${escapeHtml(section.content)}</p>`
          }
        </section>
      `,
    )
    .join('');
  reportWindow.document.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)} · Crease</title>
        <style>
          :root { color-scheme: light; font: 12px Arial, sans-serif; color: #172b22; }
          body { margin: 0 auto; max-width: 1000px; padding: 34px; }
          header { border-bottom: 3px solid #1f5a3d; margin-bottom: 24px; padding-bottom: 14px; }
          .brand { color: #1f5a3d; font-size: 14px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
          h1 { font-size: 25px; margin: 10px 0 4px; }
          .subtitle { color: #64746a; margin: 0; }
          section { margin: 18px 0; break-inside: auto; }
          h2 { color: #123d2b; font-size: 16px; margin: 0 0 9px; break-after: avoid; }
          .table-wrap { overflow: visible; }
          table { border-collapse: collapse; font-size: 10px; width: 100%; }
          th, td { border: 1px solid #e3e9e0; padding: 6px 7px; text-align: left; }
          th { background: #f0f4ed; color: #123d2b; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          footer { border-top: 1px solid #e3e9e0; color: #64746a; margin-top: 30px; padding-top: 9px; }
          @media print {
            @page { size: landscape; margin: 14mm; }
            body { max-width: none; padding: 0; }
            section { break-inside: auto; }
            thead { display: table-header-group; }
          }
        </style>
      </head>
      <body>
        <header><div class="brand">Crease · Your game, recorded</div><h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p></header>
        ${sectionHtml}
        <footer>Created offline with Crease · ${escapeHtml(new Date().toLocaleString())}</footer>
      </body>
    </html>`);
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => reportWindow.print(), 300);
}
