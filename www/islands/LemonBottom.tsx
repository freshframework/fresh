import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { WaveTank } from "../components/WaveTank.ts";

function easeInCirc(x: number) {
  return 1 - Math.sqrt(1 - Math.pow(x, 2));
}

const waveTank = new WaveTank();

function LemonBottom() {
  const SVG_WIDTH = 100;
  const counter = useSignal(0);
  const dropY = useSignal(60);
  const width = useSignal(SVG_WIDTH);
  const widthRef = useRef(width.value);
  const springs = useSignal(waveTank.springs);
  const requestIdRef = useRef<number>();
  const grid = SVG_WIDTH / waveTank.waveLength;
  let lemonTop: SVGElement | null;
  let lemonTopLeft: number;
  const points = [
    [0, 100],
    [0, 0],
    ...springs.value.map((x, i) => [i * grid, x.p]),
    [width.value, 0],
    [width.value, 100],
  ];
  const springsPath = `${points.map((x) => x.join(",")).join(" ")}`;

  function updateJuice(timestamp: number) {
    const amp = 40;
    const x = timestamp / 2000;
    const saw = x - Math.floor(x);
    if (saw < 0.6) {
      counter.value = easeInCirc(saw) * amp;
      dropY.value = -100;
    } else {
      counter.value = easeInCirc(1 - saw) * amp * 0.1;
      dropY.value = 70 + Math.pow(saw - 0.6, 2) * 10000;
    }
  }

  function update(timestamp: number) {
    updateJuice(timestamp);
    waveTank.update(waveTank.springs);
    springs.value = [...waveTank.springs];

    const offset = 500;
    const saw = (timestamp + offset) / 2000 - Math.floor((timestamp + offset) / 2000);
    if (saw < 0.01) {
      drop();
    }
    requestIdRef.current = globalThis.requestAnimationFrame(update);
  }

  function resize() {
    width.value = document.body.clientWidth;
    lemonTop = document.querySelector("#lemon-top");
    lemonTopLeft = lemonTop ? lemonTop.getBoundingClientRect().left + 25 : 50;
  }

  function drop() {
    let dropPosition = 50;
    if (widthRef.current >= 768) {
      dropPosition = Math.round((100 / widthRef.current) * lemonTopLeft);
    } else {
      dropPosition = Math.round(((widthRef.current / 2 - 30) / widthRef.current) * 100);
    }
    waveTank.springs[dropPosition].p = -40;
  }

  useEffect(() => {
    widthRef.current = width.value;
  }, [width.value]);

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      return;
    }

    requestIdRef.current = requestAnimationFrame(update);
    globalThis.addEventListener("resize", resize);
    resize();

    return () => {
      globalThis.removeEventListener("resize", resize);
      if (requestIdRef.current !== undefined) {
        cancelAnimationFrame(requestIdRef.current);
      }
    };
  }, []);

  return (
    <svg
      aria-hidden="true"
      width="100%"
      height="100px"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style="margin-top: -60px"
    >
      <polygon points={springsPath} fill="white" transform="translate(0, 50)"></polygon>
    </svg>
  );
}

export default LemonBottom;
