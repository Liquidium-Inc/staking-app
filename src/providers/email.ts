import { readFileSync } from 'node:fs';
import path from 'node:path';

import { nanoid } from 'nanoid';
import { Resend } from 'resend';

import { config } from '@/config/config';
import { db } from '@/db';
import { logger } from '@/lib/logger';

const resend = new Resend(config.email.resendApiKey);

const EMAIL_FOOTER_LOGO_FILENAME = 'isologo.png';
const EMAIL_FOOTER_LOGO_CONTENT_ID = 'liquidium-isologo';
const EMAIL_HEADER_LOGO_FILENAME = 'logo.png';
const EMAIL_HEADER_LOGO_CONTENT_ID = 'liquidium-header-logo';

interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  contentId?: string;
}

interface EmailAsset {
  attachment?: EmailAttachment;
  src: string;
}

const loadEmailAsset = (filename: string, contentId: string): EmailAsset => {
  const fallbackSrc = `${config.email.baseUrl}/${filename}`;

  try {
    const assetPath = path.join(process.cwd(), 'public', filename);
    const assetBuffer = readFileSync(assetPath);

    const attachment: EmailAttachment = {
      filename,
      content: assetBuffer.toString('base64'),
      contentType: 'image/png',
      contentId,
    };

    return {
      attachment,
      src: `cid:${contentId}`,
    };
  } catch (error) {
    logger.warn('Email asset missing, falling back to hosted image URL', { filename, error });
    return {
      attachment: undefined,
      src: fallbackSrc,
    };
  }
};

const footerLogoAsset = loadEmailAsset(EMAIL_FOOTER_LOGO_FILENAME, EMAIL_FOOTER_LOGO_CONTENT_ID);
const headerLogoAsset = loadEmailAsset(EMAIL_HEADER_LOGO_FILENAME, EMAIL_HEADER_LOGO_CONTENT_ID);

const inlineAttachments = [footerLogoAsset.attachment, headerLogoAsset.attachment].filter(
  (attachment): attachment is EmailAttachment => Boolean(attachment),
);

const defaultEmailAttachments = inlineAttachments.length ? inlineAttachments : undefined;

const inlineImage = (
  asset: EmailAsset,
  width: number,
  height: number,
  alt: string,
  style: string,
) => `<img src="${asset.src}" alt="${alt}" width="${width}" height="${height}" style="${style}" />`;

const headerLogoHtml = inlineImage(
  headerLogoAsset,
  48,
  48,
  'Liquidium logo',
  'display:block;border-radius:12px;',
);

const footerLogoHtml = inlineImage(
  footerLogoAsset,
  141,
  40,
  'Liquidium Foundation isologo',
  'opacity:0.7;display:inline-block;',
);

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const containerStyle = `font-family: ${FONT_STACK}; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #fafafa; padding: 40px; border-radius: 12px;`;
const heroWrapperStyle = 'text-align: center; margin-bottom: 32px;';
const logoWrapperStyle =
  'margin: 0 auto 16px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;';
const heroHeadingStyle = 'margin: 0; font-size: 28px; font-weight: 700; color: #fafafa;';
const heroSubtitleStyle = 'margin: 8px 0 0; font-size: 16px; color: #a1a1aa;';
const bodyTextStyle = 'font-size: 16px; line-height: 1.6; margin-bottom: 24px; color: #d4d4d4;';
const buttonStyle =
  'display: inline-block; background: linear-gradient(180deg, #f97316 0%, #ea580c 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);';
const buttonWrapperStyle = 'text-align: center; margin: 32px 0;';
const dividerBoxStyle =
  'background-color: #18181b; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #27272a;';
const hintLabelStyle = 'margin: 0 0 8px; font-size: 14px; color: #a1a1aa;';
const hintValueStyle =
  "margin: 0; word-break: break-all; color: #f97316; font-family: 'Monaco', 'Courier New', monospace; font-size: 13px;";
const smallTextStyle = 'font-size: 14px; color: #71717a; margin-bottom: 32px;';
const cardStyle =
  'background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #3f3f46;';
const cardHeadingStyle = 'margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #fafafa;';
const statsGridStyle =
  'display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;';
const metricTileStyle =
  'background-color: #090909; padding: 16px; border-radius: 8px; border: 1px solid #1f1f1f;';
const metricLabelStyle =
  'margin: 0 0 4px; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;';
const metricDetailStyle = 'margin: 4px 0 0; font-size: 12px; color: #a1a1aa;';
const walletBoxStyle =
  'background-color: #18181b; padding: 16px; border-radius: 8px; margin: 24px 0; border: 1px solid #27272a;';
const walletTextStyle = 'margin: 0; font-size: 14px; color: #71717a;';
const walletAddressStyle = "color: #f97316; font-family: 'Monaco', 'Courier New', monospace;";
const footerStyle = 'border-top: 1px solid #27272a; padding-top: 24px; text-align: center;';
const footerTextStyle = 'font-size: 14px; color: #71717a; margin: 0 0 16px;';
const footerLinkStyle = 'color: #52525b; font-size: 12px; text-decoration: underline;';
const EMAIL_UNSUBSCRIBE_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const metricValueStyle = (color: string) =>
  `margin: 0; font-size: 20px; font-weight: 700; color: ${color};`;

const renderHero = (heading: string, subtitle?: string) => `
  <div style="${heroWrapperStyle}">
    <div style="${logoWrapperStyle}">
      ${headerLogoHtml}
    </div>
    <h1 style="${heroHeadingStyle}">${heading}</h1>
    ${subtitle ? `<p style="${heroSubtitleStyle}">${subtitle}</p>` : ''}
  </div>
`;

const renderCard = (title: string, content: string) => `
  <section style="${cardStyle}">
    <h3 style="${cardHeadingStyle}">${title}</h3>
    ${content}
  </section>
`;

const renderMetric = (options: {
  label: string;
  value: string;
  detail?: string;
  valueColor: string;
}) => `
  <div style="${metricTileStyle}">
    <p style="${metricLabelStyle}">${options.label}</p>
    <p style="${metricValueStyle(options.valueColor)}">${options.value}</p>
    ${options.detail ? `<p style="${metricDetailStyle}">${options.detail}</p>` : ''}
  </div>
`;

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export const emailService = {
  async sendEmail(to: string, template: EmailTemplate) {
    try {
      const { data, error } = await resend.emails.send({
        from: config.email.fromEmail,
        to: [to],
        subject: template.subject,
        html: template.html,
        text: template.text,
        attachments: template.attachments,
      });

      if (error) {
        logger.error('Failed to send email', { to, error });
        return { success: false, error };
      }

      logger.info('Email sent successfully', { to, data });
      return { success: true, data };
    } catch (error) {
      logger.error('Error sending email', { to, error });
      return { success: false, error };
    }
  },

  generateVerificationEmail(token: string): EmailTemplate {
    const verificationUrl = new URL('/api/email/verify', config.email.baseUrl);
    verificationUrl.searchParams.set('token', token);

    return {
      subject: 'Verify your email for Liquidium staking reports',
      html: this.createVerificationEmailHtml(verificationUrl.toString()),
      text: this.createVerificationEmailText(verificationUrl.toString()),
      attachments: defaultEmailAttachments,
    };
  },

  createVerificationEmailHtml(verificationUrl: string): string {
    return `
      <div style="${containerStyle}">
        ${renderHero('Verify your email')}
        <p style="${bodyTextStyle}">
          Thank you for signing up for weekly staking reports from Liquidium! Please verify your email address to start receiving your personalized staking insights.
        </p>
        <div style="${buttonWrapperStyle}">
          <a href="${verificationUrl}" style="${buttonStyle}">Verify Email Address</a>
        </div>
        <div style="${dividerBoxStyle}">
          <p style="${hintLabelStyle}">Or copy and paste this link:</p>
          <p style="${hintValueStyle}">${verificationUrl}</p>
        </div>
        <p style="${smallTextStyle}">⏰ This link will expire in 24 hours for security reasons.</p>
        <div style="${footerStyle}">
          <p style="font-size: 12px; color: #52525b; margin: 0;">
            If you didn't request this verification, you can safely ignore this email.
          </p>
          <div style="margin-top: 16px;">
            ${footerLogoHtml}
          </div>
        </div>
      </div>
    `;
  },

  createVerificationEmailText(verificationUrl: string): string {
    return `
      Verify your email for Liquidium staking reports
      
      Thank you for signing up for weekly staking reports from Liquidium!
      
      Please visit this link to verify your email address:
      ${verificationUrl}
      
      This link will expire in 24 hours.
      
      If you didn't request this verification, you can safely ignore this email.
    `;
  },

  async generateWeeklyReportEmail(data: {
    address: string;
    email: string;
    sLiqBalance: number;
    earnedLiq: number;
    apy: number;
    totalRewardsDistributed: number;
    tokenPrice: number;
    stakedValue?: number;
  }): Promise<EmailTemplate> {
    const {
      address,
      sLiqBalance,
      earnedLiq,
      apy,
      totalRewardsDistributed,
      tokenPrice,
      stakedValue: providedStakedValue,
    } = data;

    const stakedValue = providedStakedValue ?? sLiqBalance * tokenPrice;
    const unsubscribeToken = await this.getOrCreateUnsubscribeToken(address, data.email);

    return {
      subject: 'Your weekly Liquidium staking report',
      html: this.createWeeklyReportHtml({
        address,
        sLiqBalance,
        earnedLiq,
        apy,
        totalRewardsDistributed,
        stakedValue,
        unsubscribeToken,
      }),
      text: this.createWeeklyReportText({
        address,
        sLiqBalance,
        earnedLiq,
        apy,
        totalRewardsDistributed,
        stakedValue,
        unsubscribeToken,
      }),
      attachments: defaultEmailAttachments,
    };
  },

  createWeeklyReportHtml(data: {
    address: string;
    sLiqBalance: number;
    earnedLiq: number;
    apy: number;
    totalRewardsDistributed: number;
    stakedValue: number;
    unsubscribeToken: string;
  }): string {
    const {
      address,
      sLiqBalance,
      earnedLiq,
      apy,
      totalRewardsDistributed,
      stakedValue,
      unsubscribeToken,
    } = data;

    return `
      <div style="${containerStyle}">
        ${renderHero('Your Weekly Staking Report', "Here's your staking summary for the past 7 days")}
        ${this.createStakingOverviewHtml(sLiqBalance, earnedLiq, apy, stakedValue)}
        ${this.createProtocolStatsHtml(totalRewardsDistributed)}
        <div style="${walletBoxStyle}">
          <p style="${walletTextStyle}">
            Wallet address: <span style="${walletAddressStyle}">${this.formatAddress(address)}</span>
          </p>
        </div>
        <div style="${buttonWrapperStyle}">
          <a href="${config.email.baseUrl}/portfolio" style="${buttonStyle}">View Full Portfolio</a>
        </div>
        ${this.createEmailFooter(address, unsubscribeToken)}
      </div>
    `;
  },

  createStakingOverviewHtml(
    sLiqBalance: number,
    earnedLiq: number,
    apy: number,
    stakedValue: number,
  ): string {
    const metrics = [
      {
        label: 'sLIQ Balance',
        value: sLiqBalance.toFixed(6),
        detail: 'sLIQ tokens',
        valueColor: '#fafafa',
      },
      {
        label: 'LIQ Earned',
        value: `+${earnedLiq.toFixed(6)}`,
        detail: 'past 7 days',
        valueColor: '#22c55e',
      },
      {
        label: 'Current APY',
        value: `${(apy * 100).toFixed(2)}%`,
        detail: 'annual yield',
        valueColor: '#f97316',
      },
      {
        label: 'Staked Value',
        value: `$${stakedValue.toFixed(2)}`,
        detail: 'USD value',
        valueColor: '#fafafa',
      },
    ];

    const metricsHtml = metrics.map(renderMetric).join('');

    return renderCard(
      'Your Staking Overview',
      `<div style="${statsGridStyle}">${metricsHtml}</div>`,
    );
  },

  createProtocolStatsHtml(totalRewardsDistributed: number): string {
    return renderCard(
      'Protocol Stats',
      renderMetric({
        label: 'Total Rewards Distributed',
        value: `${totalRewardsDistributed.toFixed(6)} LIQ`,
        detail: 'past 7 days across all stakers',
        valueColor: '#8b5cf6',
      }),
    );
  },

  createEmailFooter(address: string, token: string): string {
    return `
      <div style="${footerStyle}">
        <p style="${footerTextStyle}">
          You're receiving this email because you subscribed to weekly staking reports from Liquidium.
        </p>
        <div style="margin-bottom: 16px;">
          ${footerLogoHtml}
        </div>
        <a href="${config.email.baseUrl}/api/email/unsubscribe?address=${encodeURIComponent(address)}&token=${encodeURIComponent(token)}" style="${footerLinkStyle}">
          Unsubscribe from these emails
        </a>
      </div>
    `;
  },

  createWeeklyReportText(data: {
    address: string;
    sLiqBalance: number;
    earnedLiq: number;
    apy: number;
    totalRewardsDistributed: number;
    stakedValue: number;
    unsubscribeToken: string;
  }): string {
    const {
      address,
      sLiqBalance,
      earnedLiq,
      apy,
      totalRewardsDistributed,
      stakedValue,
      unsubscribeToken,
    } = data;

    return `
      Your Weekly Liquidium Staking Report
      
      Here's your staking summary for the past 7 days:
      
      Your Staking Overview:
      - sLIQ Balance: ${sLiqBalance.toFixed(6)} sLIQ
      - LIQ Earned (7 days): +${earnedLiq.toFixed(6)} LIQ
      - Current APY: ${(apy * 100).toFixed(2)}%
      - Staked Value: $${stakedValue.toFixed(2)}
      
      Protocol Stats:
      - Total Rewards Distributed (7 days): ${totalRewardsDistributed.toFixed(6)} LIQ
      
      Your wallet address: ${this.formatAddress(address)}
      
      View your portfolio: ${config.email.baseUrl}/portfolio
      
      You're receiving this email because you subscribed to weekly staking reports from Liquidium.
      Unsubscribe: ${config.email.baseUrl}/api/email/unsubscribe?address=${encodeURIComponent(address)}&token=${encodeURIComponent(unsubscribeToken)}
    `;
  },

  formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  },

  async getOrCreateUnsubscribeToken(address: string, email: string): Promise<string> {
    const existingToken = await db.emailSubscription.getLatestTokenForAddress(address);

    if (existingToken && new Date(existingToken.expiresAt) > new Date()) {
      return existingToken.token;
    }

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + EMAIL_UNSUBSCRIBE_TOKEN_TTL_MS);

    await db.emailSubscription.insertVerificationToken(address, email, token, expiresAt);

    return token;
  },
};
