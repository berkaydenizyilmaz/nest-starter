export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

export interface MailMessage extends MailContent {
  to: string;
}

export interface MailTransport {
  send(from: string, message: MailMessage): Promise<void>;
}
