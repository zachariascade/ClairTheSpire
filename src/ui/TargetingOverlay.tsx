type TargetingOverlayProps = {
  activeCardRect: DOMRect | null;
  pointer: { x: number; y: number } | null;
  isAnimating: boolean;
  isTargetingEnemy: boolean;
};

export function TargetingOverlay({ activeCardRect, pointer, isAnimating, isTargetingEnemy }: TargetingOverlayProps) {
  if (!activeCardRect || !pointer) {
    return <svg className="targeting-overlay" aria-hidden="true" />;
  }

  const startX = activeCardRect.left + activeCardRect.width / 2;
  const startY = activeCardRect.top + activeCardRect.height / 2;
  const endX = pointer.x;
  const endY = pointer.y;
  const controlY = Math.min(startY, endY) - 130;
  const path = `M ${startX} ${startY} Q ${(startX + endX) / 2} ${controlY} ${endX} ${endY}`;

  return (
    <svg className={`targeting-overlay ${isTargetingEnemy ? "is-targeting-enemy" : ""}`} aria-hidden="true">
      <defs>
        <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto">
          <path d="M 0 0 L 12 6 L 0 12 z" />
        </marker>
      </defs>
      <path className="targeting-arc-shadow" d={path} />
      <path className="targeting-arc" d={path} markerEnd="url(#arrowhead)" />
      {isAnimating && (
        <rect
          className="ghost-card"
          x={startX - 42}
          y={startY - 58}
          width="84"
          height="116"
          rx="8"
          style={{
            transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.42)`,
          }}
        />
      )}
    </svg>
  );
}
