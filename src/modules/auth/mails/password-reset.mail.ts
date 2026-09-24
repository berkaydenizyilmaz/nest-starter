import { escapeHtml, mailLayout } from '../../../core/mail/mail-layout.js';
import type { MailContent } from '../../../core/mail/mail.types.js';

export function passwordResetMail({
  resetUrl,
  expiresInMinutes,
}: {
  resetUrl: string;
  expiresInMinutes: number;
}): MailContent {
  const url = escapeHtml(resetUrl);

  return {
    subject: 'Şifre sıfırlama isteği',
    text: [
      'Hesabınız için bir şifre sıfırlama isteği aldık.',
      `Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı açın. Bağlantı ${expiresInMinutes} dakika geçerlidir.`,
      '',
      resetUrl,
      '',
      'Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmez.',
    ].join('\n'),
    html: mailLayout(`
      <p>Hesabınız için bir şifre sıfırlama isteği aldık.</p>
      <p>Yeni şifrenizi belirlemek için aşağıdaki düğmeye tıklayın. Bağlantı ${expiresInMinutes} dakika geçerlidir.</p>
      <p style="margin:24px 0">
        <a href="${url}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Şifremi sıfırla</a>
      </p>
      <p style="font-size:13px;color:#555">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br />${url}</p>
      <p style="font-size:13px;color:#555">Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmez.</p>
    `),
  };
}
