import { Circle, G, Line, Polygon, Svg, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import {
  BOX,
  CARDINALS,
  CENTRE as C,
  MINOR_TICKS,
  point,
  RING_R as R,
} from '@/qibla/dial-geometry';

/**
 * The compass rose.
 *
 * Direction A, so: a printed instrument, not an app widget. Engraved rules, no
 * glow, no gradient, no shadow. Everything is `hairline` or `inkMuted` except
 * the Kaaba marker, which is the only accent on the screen and therefore the
 * only thing the eye goes to.
 *
 * Drawn at a fixed 264-unit box and scaled by the `size` prop through the
 * viewBox, so every number below is a literal you can read off the drawing
 * rather than a fraction of a fraction. The polar frame lives in
 * `dial-geometry.ts`, where it is asserted.
 */

const TICK_CARDINAL = 12;
const TICK_MINOR = 6;
const LETTER_R = 88;
/**
 * The marker stops short of the centre so the bearing figure can sit there.
 *
 * 72 is not a round number, it is a measured one: the readout's furthest corner
 * — the end of "TRUE NORTH", at the largest Dynamic Type we allow it — reaches
 * about 68 units from the centre. At 52 the marker line ran straight through the
 * caption at bearings near 115° and 245°, which is how this number got fixed.
 */
const MARKER_INNER = 72;
const MARKER_TIP = R - 2;
const MARKER_BASE = R - 18;
/** Half-width of the marker wedge, in degrees. */
const MARKER_SPREAD = 3.6;

export function QiblaDial({
  size,
  qibla,
  heading,
  aligned,
  live,
}: {
  size: number;
  /** Qibla bearing from true north, degrees. */
  qibla: number;
  /** Device heading from true north, degrees. 0 orients the rose to true north. */
  heading: number;
  /** Within `ALIGNED_DEG` of the qibla. Changes the state of the whole instrument. */
  aligned: boolean;
  /** False when there is no live heading, which mutes the index mark — it would mean nothing. */
  live: boolean;
}) {
  const t = useTheme();

  // The rose turns, the index mark at the top does not — a compass card, not a
  // needle. Negative because turning the device clockwise must turn the card
  // anticlockwise for north to stay put.
  const rose = `rotate(${-heading} ${C} ${C})`;
  const ringColor = aligned ? t.color.accent : t.color.hairline;
  const indexColor = aligned ? t.color.accent : live ? t.color.ink : t.color.hairline;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      {/*
        The fixed index mark: "the top of the phone is pointing this way". It
        sits outside the ring so it can never be confused with a tick, and it
        meets the Kaaba marker exactly when the two agree.
      */}
      <Polygon
        points={`${C},14 ${C - 7},1 ${C + 7},1`}
        fill={indexColor}
        stroke="none"
      />

      <Circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke={ringColor}
        strokeWidth={aligned ? 2 : 1}
      />

      <G transform={rose}>
        {MINOR_TICKS.map((deg) => {
          const [x1, y1] = point(R, deg);
          const [x2, y2] = point(R - TICK_MINOR, deg);
          return (
            <Line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={t.color.hairline}
              strokeWidth={1}
            />
          );
        })}

        {CARDINALS.map(({ deg, letter }) => {
          const [x1, y1] = point(R, deg);
          const [x2, y2] = point(R - TICK_CARDINAL, deg);
          const [lx, ly] = point(LETTER_R, deg);
          return (
            <G key={letter}>
              <Line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={deg === 0 ? t.color.ink : t.color.inkMuted}
                strokeWidth={deg === 0 ? 2 : 1}
              />
              {/*
                The letters turn with the card, the way the printed card of a
                real compass does — S is upside down when you face south. Keeping
                them upright would need a counter-rotation per glyph and would
                read as a UI element floating over an instrument.
              */}
              <SvgText
                x={lx}
                y={ly}
                fill={deg === 0 ? t.color.ink : t.color.inkMuted}
                fontFamily={t.font.latinUi}
                fontSize={t.latinSize.label}
                textAnchor="middle"
                // SVG anchors text on its baseline; this drops it to the optical
                // centre of the cap height.
                dy={t.latinSize.label * 0.36}>
                {letter}
              </SvgText>
            </G>
          );
        })}

        {/*
          The Kaaba. One radial rule and one wedge, in the only accent on this
          screen. No cube glyph, no icon: a mark on an instrument, which is also
          the safest reading of the "geometry only" rule in DESIGN.md.
        */}
        <Line
          x1={point(MARKER_INNER, qibla)[0]}
          y1={point(MARKER_INNER, qibla)[1]}
          x2={point(MARKER_BASE, qibla)[0]}
          y2={point(MARKER_BASE, qibla)[1]}
          stroke={t.color.accent}
          strokeWidth={1.5}
        />
        <Polygon
          points={[
            point(MARKER_TIP, qibla),
            point(MARKER_BASE, qibla - MARKER_SPREAD),
            point(MARKER_BASE, qibla + MARKER_SPREAD),
          ]
            .map(([x, y]) => `${x},${y}`)
            .join(' ')}
          fill={t.color.accent}
          stroke="none"
        />
      </G>
    </Svg>
  );
}
