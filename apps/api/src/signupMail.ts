// "A new rider joined" notice to the owner, sent through Cloudflare's send_email binding (Workers only). The recipient
// comes from the SIGNUP_NOTIFY_TO secret and is never written in the repository. Plain text on purpose: the rider chose
// their name, so it must not be able to put HTML into the owner's mailbox, and no line of it may become a mail header.
export type NewRider = { name: string; email: string | null; country: string | null };

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 200);

/** The raw RFC 5322 message: headers from fixed text and encoded words only, body base64. */
export function signupNotice(from: string, to: string, rider: NewRider, now = new Date()): string {
  const body = [`A new rider joined MyFitBike.`, ``, `Name:    ${oneLine(rider.name)}`, `E-mail:  ${oneLine(rider.email ?? '(none)')}`, `Country: ${oneLine(rider.country ?? '(not set)')}`, `Joined:  ${now.toISOString()}`].join('\r\n');
  return [
    `From: =?UTF-8?B?${b64('MyFitBike')}?= <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(`New rider: ${oneLine(rider.name)}`)}?=`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`, `Date: ${now.toUTCString()}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(body).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}
