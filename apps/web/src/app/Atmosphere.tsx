// Fixed background glows (plan 10.1): static radial gradients, no animation and no blur filter, so they cost nothing per frame.
export function Atmosphere() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none bg-surface"
      style={{ backgroundImage: 'radial-gradient(600px 600px at 70% -8%, color-mix(in srgb, var(--color-glow-plum) 28%, transparent), transparent 70%), radial-gradient(760px 760px at 102% 95%, color-mix(in srgb, var(--color-glow-teal) 26%, transparent), transparent 70%)' }} />
  );
}
