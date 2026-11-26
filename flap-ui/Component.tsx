import { useState } from 'react';

type Props = {
  context: Readonly<{
    launcherAddress: string | null;
    snapshot: Readonly<{ raisedWei?: string | null; tokenAddress?: string | null }> | null;
  }>;
  messages: Record<string, string>;
  host: Readonly<{ redirect?(path: string): boolean }>;
};

const zero = '0x0000000000000000000000000000000000000000';

function formatBNB(wei: string) {
  const digits = wei.padStart(19, '0');
  const fraction = digits.slice(-18).replace(/0+$/, '');
  return digits.slice(0, -18) + (fraction ? '.' + fraction : '') + ' tBNB';
}

export function Launcher({ context, messages, host }: Props) {
  const [unavailable, setUnavailable] = useState(false);
  const { launcherAddress, snapshot } = context;
  const issued = snapshot?.tokenAddress && snapshot.tokenAddress !== zero ? snapshot.tokenAddress : null;
  return (
    <section style={{ padding: 20, border: '1px solid #685487', borderRadius: 12, overflowWrap: 'anywhere' }}>
      <h2 style={{ margin: 0 }}>PackLaunch</h2>
      <p>{messages.summary}</p>
      {!launcherAddress ? <p role="status">{messages.noInstance}</p> : (
        <>
          <dl style={{ display: 'grid', gap: 8 }}>
            <dt>{messages.raised}</dt>
            <dd style={{ margin: 0 }}>{snapshot?.raisedWei ? formatBNB(snapshot.raisedWei) : '—'}</dd>
            <dt>{messages.issuance}</dt>
            <dd style={{ margin: 0 }}>{issued ? <code>{issued}</code> : snapshot?.tokenAddress ? messages.pending : '—'}</dd>
          </dl>
          <button type="button" style={{ minHeight: 44, padding: '0 14px' }}
            onClick={() => setUnavailable(host.redirect?.('/apps/packlaunch?launcher=' + launcherAddress) !== true)}>
            {messages.open}
          </button>
        </>
      )}
      {unavailable && <p role="status">{messages.unavailable}</p>}
    </section>
  );
}
