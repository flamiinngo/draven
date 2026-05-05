import { useEffect, useRef } from "react";

export function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let raf: number;

    canvas.width  = width;
    canvas.height = height;

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width  = width;
      canvas.height = height;
    };
    window.addEventListener("resize", handleResize);

    // Network nodes — increased opacity range for visibility
    const NODE_COUNT = 28;
    type Node = { x: number; y: number; vx: number; vy: number; radius: number; opacity: number };
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x:       Math.random() * width,
      y:       Math.random() * height,
      vx:      (Math.random() - 0.5) * 0.25,
      vy:      (Math.random() - 0.5) * 0.25,
      radius:  1 + Math.random() * 1.5,
      opacity: 0.4 + Math.random() * 0.5,
    }));

    // Orbs (large blurred gradient blobs)
    const ORBS = [
      { x: width * 0.15, y: height * 0.1,  r: 420, color: "79,70,229",  speed: 0.00012 },
      { x: width * 0.85, y: height * 0.8,  r: 360, color: "99,102,241", speed: 0.00009 },
      { x: width * 0.5,  y: height * 0.5,  r: 280, color: "67,56,202",  speed: 0.00015 },
    ];

    let t = 0;

    function draw() {
      t++;
      ctx!.clearRect(0, 0, width, height);

      // Background fill
      ctx!.fillStyle = "#0a0a0a";
      ctx!.fillRect(0, 0, width, height);

      // Orbs — slightly more visible center stop
      ORBS.forEach((orb, i) => {
        const ox = orb.x + Math.sin(t * orb.speed + i) * width * 0.12;
        const oy = orb.y + Math.cos(t * orb.speed * 1.3 + i) * height * 0.1;
        const grad = ctx!.createRadialGradient(ox, oy, 0, ox, oy, orb.r);
        grad.addColorStop(0,   `rgba(${orb.color}, 0.12)`);
        grad.addColorStop(0.5, `rgba(${orb.color}, 0.05)`);
        grad.addColorStop(1,   `rgba(${orb.color}, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(ox, oy, orb.r, 0, Math.PI * 2);
        ctx!.fill();
      });

      // Dot grid — subtle base alpha
      const GRID = 60;
      const cols = Math.ceil(width / GRID);
      const rows = Math.ceil(height / GRID);
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          const gx = c * GRID;
          const gy = r * GRID;
          const orbX = ORBS[0].x + Math.sin(t * ORBS[0].speed) * width * 0.12;
          const orbY = ORBS[0].y + Math.cos(t * ORBS[0].speed * 1.3) * height * 0.1;
          const dist = Math.hypot(gx - orbX, gy - orbY);
          const alpha = Math.max(0, 0.015 - dist / (width * 2.5)) + 0.015;
          ctx!.fillStyle = `rgba(99,102,241,${alpha})`;
          ctx!.beginPath();
          ctx!.arc(gx, gy, 0.8, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // Move nodes
      nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width)  n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      });

      // Edges between nearby nodes — brighter alpha
      const EDGE_DIST = 180;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < EDGE_DIST) {
            const alpha = (1 - d / EDGE_DIST) * 0.2;
            ctx!.strokeStyle = `rgba(79,70,229,${alpha})`;
            ctx!.lineWidth   = 0.6;
            ctx!.beginPath();
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.stroke();
          }
        }
      }

      // Nodes — full opacity factor for better visibility
      nodes.forEach(n => {
        ctx!.fillStyle = `rgba(99,102,241,${n.opacity})`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx!.fill();
      });

      raf = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{ position: "fixed", inset: 0, zIndex: 0, width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
