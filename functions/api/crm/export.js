/**
 * CRM Lead Export API
 * GET /api/crm/export - Download full CSV of all contacts/leads
 */

import { checkAuth } from './auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!env.DB) {
    return new Response('Database not configured', { status: 500 });
  }

  try {
    const { results: leads } = await env.DB.prepare(
      'SELECT * FROM leads ORDER BY created_at DESC'
    ).all();

    const headers = [
      'ID', 'Name', 'Email', 'Phone', 'Company', 'Service Interest',
      'Status', 'Estimated Value', 'Source Page', 'UTM Source',
      'UTM Campaign', 'Referrer', 'Country', 'Message', 'Created At'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csvContent = headers.join(',') + '\n';

    for (const lead of (leads || [])) {
      const row = [
        lead.id,
        lead.name,
        lead.email,
        lead.phone,
        lead.company,
        lead.service_interest,
        lead.status,
        lead.estimated_value || 0,
        lead.source_page,
        lead.utm_source,
        lead.utm_campaign,
        lead.referrer,
        lead.ip_country,
        lead.message,
        lead.created_at
      ];
      csvContent += row.map(escapeCsv).join(',') + '\n';
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `g3z-creative-leads-${dateStr}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    return new Response(`Export failed: ${error.message}`, { status: 500 });
  }
}
