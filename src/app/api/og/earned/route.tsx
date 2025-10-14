import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

import { formatCurrency } from '@/lib/formatCurrency';
import { getRunePrice } from '@/providers/rune-provider';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const amount = searchParams.get('amount');

    if (!amount || Number.isNaN(Number(amount))) {
      return new Response('Invalid amount parameter', { status: 400 });
    }

    const tokenAmount = Number(amount);

    // fetch current token price
    const tokenPrice = await getRunePrice();
    const usdValue = tokenAmount * tokenPrice;

    // load fonts
    const fontBoldData = await fetch(
      new URL('../../../fonts/TT_Commons_Pro_Bold.woff', import.meta.url),
    ).then((res) => res.arrayBuffer());

    const fontMediumData = await fetch(
      new URL('../../../fonts/TT_Commons_Pro_Medium.woff', import.meta.url),
    ).then((res) => res.arrayBuffer());

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#000',
            backgroundImage:
              'radial-gradient(circle at 12% 45%, rgba(249, 115, 22, 0.35) 0%, transparent 60%), radial-gradient(circle at 80% 45%, rgba(22, 163, 74, 0.12) 0%, transparent 50%), linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 100% 100%, 40px 40px, 40px 40px',
            fontFamily: 'TT Commons Pro',
            padding: '50px',
            position: 'relative',
          }}
        >
          {/* hexagonal pattern overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'repeating-linear-gradient(30deg, transparent, transparent 60px, rgba(249, 115, 22, 0.06) 60px, rgba(249, 115, 22, 0.06) 61px), repeating-linear-gradient(-30deg, transparent, transparent 60px, rgba(249, 115, 22, 0.06) 60px, rgba(249, 115, 22, 0.06) 61px)',
              display: 'flex',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              gap: '52px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {/* header */}
            <div
              style={{
                fontSize: 60,
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.5)',
                display: 'flex',
              }}
            >
              Total earned
            </div>

            {/* main content */}
            <div
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '-15px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px',
                }}
              >
                <img
                  src={`${process.env.BASE_URL}/liquidium.svg`}
                  alt="Liquidium"
                  width="208"
                  height="210"
                  style={{
                    marginTop: '15px',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      fontSize: 110,
                    }}
                  >
                    <span
                      style={{
                        color: '#fff',
                        fontWeight: 700,
                      }}
                    >
                      {formatCurrency(tokenAmount, 2)}
                    </span>
                    <span
                      style={{
                        color: '#ea580c',
                        fontWeight: 500,
                      }}
                    >
                      LIQ
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 64,
                      color: 'rgba(163, 163, 163, 1)',
                      display: 'flex',
                    }}
                  >
                    ${formatCurrency(usdValue)} USD
                  </div>
                </div>
              </div>
              <div
                style={{
                  borderRadius: '9999px',
                  border: '2px solid rgb(34, 197, 94)',
                  backgroundColor: 'rgb(21, 128, 61)',
                  padding: '8px 16px',
                  fontSize: 40,
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatCurrency((tokenAmount / 100) * 100, 2)}% APY
              </div>
            </div>

            {/* footer */}
            <div
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: '1px solid rgba(82, 82, 82, .5)',
                paddingTop: '50px',
              }}
            >
              <img
                src={`${process.env.BASE_URL}/isologo.svg`}
                alt="Liquidium"
                width="340"
                height="90"
              />
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 500,
                  color: '#fff',
                  display: 'flex',
                }}
              >
                stake.liquidium.org
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'TT Commons Pro',
            data: fontBoldData,
            style: 'normal',
            weight: 700,
          },
          {
            name: 'TT Commons Pro',
            data: fontMediumData,
            style: 'normal',
            weight: 500,
          },
        ],
      },
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
