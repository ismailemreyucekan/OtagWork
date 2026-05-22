/**
 * OtagWork Logo — daire içinde otağ (çadır) şeklinde 6-nokta grafiği.
 *
 * Tek dosyada SVG; renkler props ile değiştirilebilir.
 *
 * Kullanım:
 *   <Logo size={56} />                       — varsayılan kırmızı palet
 *   <Logo size={40} variant="inverse" />     — beyaz/şeffaf, koyu zemin için
 *
 * variant:
 *   "default" — kırmızı kontur + pembe tonlu dolgular (beyaz zemine)
 *   "inverse" — beyaz kontur + şeffaf dolgular (gradient zemine)
 *   "solid"   — tek-renk dolgu (tüm noktalar primary)
 */
const PALETTES = {
  default: {
    ring:        '#E06666',
    nodeTop:     '#D87C7C',
    nodeMid:     '#E69999',
    nodeBottom:  '#F1B5B5',
    nodeCenter:  '#B14545',
    edge:        '#F1B5B5',
    edgeStrong:  '#D87C7C',
  },
  inverse: {
    ring:        '#FFFFFF',
    nodeTop:     'rgba(255,255,255,0.92)',
    nodeMid:     'rgba(255,255,255,0.78)',
    nodeBottom:  'rgba(255,255,255,0.62)',
    nodeCenter:  '#FFFFFF',
    edge:        'rgba(255,255,255,0.45)',
    edgeStrong:  'rgba(255,255,255,0.7)',
  },
  solid: {
    ring:        '#E06666',
    nodeTop:     '#E06666',
    nodeMid:     '#E06666',
    nodeBottom:  '#E06666',
    nodeCenter:  '#B14545',
    edge:        '#E06666',
    edgeStrong:  '#E06666',
  },
}

const Logo = ({ size = 48, variant = 'default', title = 'OtagWork', className = '', style }) => {
  const p = PALETTES[variant] || PALETTES.default
  // Konum tablosu (viewBox 100x100)
  const N = {
    top:        { x: 50, y: 26 },
    leftUp:     { x: 28, y: 44 },
    rightUp:    { x: 72, y: 44 },
    center:     { x: 50, y: 56 },
    leftDown:   { x: 28, y: 76 },
    rightDown:  { x: 72, y: 76 },
  }
  const line = (a, b, w = 3, color = p.edge) => (
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} strokeLinecap="round" />
  )

  return (
    <svg
      className={`logo-svg ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>

      {/* Dış halka */}
      <circle cx="50" cy="50" r="42" stroke={p.ring} strokeWidth="4" fill="none" />

      {/* Bağlantı kenarları (önce çiz, üzerine noktalar gelsin) */}
      {/* Çadır üst üçgeni */}
      {line(N.leftUp,   N.top,     3.5, p.edgeStrong)}
      {line(N.top,      N.rightUp, 3.5, p.edgeStrong)}
      {/* Yan kenarlar */}
      {line(N.leftUp,   N.leftDown,  3, p.edge)}
      {line(N.rightUp,  N.rightDown, 3, p.edge)}
      {/* Alt taban */}
      {line(N.leftDown, N.rightDown, 3, p.edge)}
      {/* Merkeze bağlanan iç hatlar (otağ direkleri) */}
      {line(N.leftUp,   N.center,    2.5, p.edge)}
      {line(N.rightUp,  N.center,    2.5, p.edge)}
      {line(N.center,   N.leftDown,  2.5, p.edge)}
      {line(N.center,   N.rightDown, 2.5, p.edge)}

      {/* Noktalar (en üste) */}
      <circle cx={N.top.x}       cy={N.top.y}       r="6.5" fill={p.nodeTop} />
      <circle cx={N.leftUp.x}    cy={N.leftUp.y}    r="6.5" fill={p.nodeMid} />
      <circle cx={N.rightUp.x}   cy={N.rightUp.y}   r="6.5" fill={p.nodeMid} />
      <circle cx={N.leftDown.x}  cy={N.leftDown.y}  r="6.5" fill={p.nodeBottom} />
      <circle cx={N.rightDown.x} cy={N.rightDown.y} r="6.5" fill={p.nodeBottom} />
      <circle cx={N.center.x}    cy={N.center.y}    r="4.5" fill={p.nodeCenter} />
    </svg>
  )
}

export default Logo
