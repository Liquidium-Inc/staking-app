import { NextRequest } from 'next/server';

import { config } from '@/config/config';
import { logger } from '@/lib/logger';
import { runWeeklyEmailCron } from '@/services/weeklyEmail.service';

export const maxDuration = 300; // 5 minutes

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${config.secrets.cron}`)
    return new Response('Unauthorized', { status: 401 });

  try {
    const result = await runWeeklyEmailCron();
    if (result.totalUsers === 0) {
      return Response.json({ success: true, message: 'No users to send emails to' });
    }
    return Response.json({
      success: result.success,
      message: 'Weekly emails sent successfully',
      stats: {
        totalUsers: result.totalUsers,
        emailsSent: result.emailsSent,
        emailsSkipped: result.emailsSkipped,
        totalRewardsDistributed: result.totalRewardsDistributed,
      },
    });
  } catch (error) {
    logger.error('Weekly email cron job failed:', error);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
