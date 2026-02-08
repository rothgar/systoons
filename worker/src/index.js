import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

// Allowed origins for CORS — update with your actual domain
const ALLOWED_ORIGINS = [
  'https://systoons.com',
  'https://www.systoons.com',
  'https://systoons.pages.dev',
  'http://localhost:8000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin?.endsWith('.systoons.pages.dev');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
    }

    try {
      const body = await request.json();
      const { name, email, company, message } = body;

      // Validate required fields
      if (!name?.trim() || !email?.trim()) {
        return Response.json(
          { error: 'Name and email are required' },
          { status: 400, headers }
        );
      }

      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return Response.json(
          { error: 'Invalid email address' },
          { status: 400, headers }
        );
      }

      // Rate limiting via simple timestamp check (optional: use KV for persistence)
      // For now, we trust Cloudflare's built-in DDoS protection

      // Build the email
      const msg = createMimeMessage();
      msg.setSender({ name: 'Systoons Website', addr: 'noreply@systoons.com' });
      msg.setRecipient('contact@systoons.com');
      msg.setSubject(`New inquiry from ${name.trim()}`);

      const safeName = escapeHtml(name.trim());
      const safeEmail = escapeHtml(email.trim());
      const safeCompany = escapeHtml(company?.trim() || 'Not provided');
      const safeMessage = escapeHtml(message?.trim() || 'No message provided');

      // Plain text version
      msg.addMessage({
        contentType: 'text/plain',
        data: [
          `New contact form submission from systoons.com`,
          ``,
          `Name: ${name.trim()}`,
          `Email: ${email.trim()}`,
          `Company: ${company?.trim() || 'Not provided'}`,
          ``,
          `Message:`,
          `${message?.trim() || 'No message provided'}`,
          ``,
          `---`,
          `Reply directly to this email to respond to ${email.trim()}`,
        ].join('\n'),
      });

      // HTML version
      msg.addMessage({
        contentType: 'text/html',
        data: `
          <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #3A87E7; padding: 20px; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0;">\uD83C\uDFA8 New Systoons Inquiry</h2>
            </div>
            <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; font-weight: bold; color: #1B3A5C;">Name</td><td style="padding: 8px 0;">${safeName}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold; color: #1B3A5C;">Email</td><td style="padding: 8px 0;"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold; color: #1B3A5C;">Company</td><td style="padding: 8px 0;">${safeCompany}</td></tr>
              </table>
              <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border-left: 4px solid #FFD243;">
                <p style="margin: 0 0 4px; font-weight: bold; color: #1B3A5C;">Message</p>
                <p style="margin: 0; white-space: pre-wrap;">${safeMessage}</p>
              </div>
              <p style="margin-top: 20px; font-size: 13px; color: #888;">Reply directly to respond to ${safeEmail}</p>
            </div>
          </div>
        `,
      });

      // Set Reply-To so you can reply directly to the sender
      msg.setHeader('Reply-To', email.trim());

      // Send via Cloudflare Email Routing
      const emailMsg = new EmailMessage('noreply@systoons.com', 'contact@systoons.com', msg.asRaw());
      await env.SEND_EMAIL.send(emailMsg);

      return Response.json({ success: true }, { status: 200, headers });
    } catch (err) {
      console.error('Email send failed:', err);
      return Response.json(
        { error: 'Failed to send message. Please try again.' },
        { status: 500, headers }
      );
    }
  },
};
