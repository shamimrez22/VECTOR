/**
 * Generates authentic raster PNG icon files and icon-sheet images on HTML5 Canvas
 * for instant testing and verification of all 10 required test cases.
 */

function canvasToFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas blob তৈরি করা যায়নি।'));
        return;
      }
      resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
  });
}

/**
 * Draws 18 distinct professional line-art & geometric icons (many with disconnected parts and negative spaces)
 * centered inside `(cx, cy)` with radius/scale `size`.
 */
function drawSampleIconByIndex(
  ctx: CanvasRenderingContext2D,
  index: number,
  cx: number,
  cy: number,
  size: number,
  color: string = '#0F172A'
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(6, size * 0.085);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const r = size * 0.38;
  const type = index % 18;

  switch (type) {
    case 0: {
      // 1. House Icon (Roof, straight walls, door, window, chimney — interior negative spaces)
      // Roof
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.05, cy - r * 0.1);
      ctx.lineTo(cx, cy - r * 0.95);
      ctx.lineTo(cx + r * 1.05, cy - r * 0.1);
      ctx.stroke();

      // Detached Chimney
      ctx.beginPath();
      ctx.rect(cx + r * 0.42, cy - r * 0.78, r * 0.22, r * 0.35);
      ctx.fill();

      // Straight House Walls & Floor
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.78, cy - r * 0.22);
      ctx.lineTo(cx - r * 0.78, cy + r * 0.88);
      ctx.lineTo(cx + r * 0.78, cy + r * 0.88);
      ctx.lineTo(cx + r * 0.78, cy - r * 0.22);
      ctx.stroke();

      // Door (interior negative space)
      ctx.beginPath();
      ctx.rect(cx - r * 0.24, cy + r * 0.18, r * 0.48, r * 0.7);
      ctx.stroke();

      // Window (top circular/square negative space)
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.28, r * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 1: {
      // 2. Camera Icon (Circular lens, smooth outer body, flash dot, top shutter)
      // Rounded outer camera body
      const bw = r * 1.85;
      const bh = r * 1.3;
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + r * 0.12;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, r * 0.24);
      ctx.stroke();

      // Top viewfinder hump
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, by);
      ctx.lineTo(cx - r * 0.28, by - r * 0.28);
      ctx.lineTo(cx + r * 0.28, by - r * 0.28);
      ctx.lineTo(cx + r * 0.45, by);
      ctx.stroke();

      // Circular outer lens ring
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.12, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();

      // Inner lens core
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.12, r * 0.16, 0, Math.PI * 2);
      ctx.fill();

      // Detached Flash dot
      ctx.beginPath();
      ctx.arc(cx + r * 0.62, by + r * 0.28, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 2: {
      // 3. Graduation Cap (Multi-part icon with disconnected tassel & skullcap)
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.75);
      ctx.lineTo(cx + r * 1.05, cy - r * 0.2);
      ctx.lineTo(cx, cy + r * 0.35);
      ctx.lineTo(cx - r * 1.05, cy - r * 0.2);
      ctx.closePath();
      ctx.stroke();

      // Detached lower cap band
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.58, cy + r * 0.18);
      ctx.lineTo(cx - r * 0.58, cy + r * 0.65);
      ctx.quadraticCurveTo(cx, cy + r * 0.92, cx + r * 0.58, cy + r * 0.65);
      ctx.lineTo(cx + r * 0.58, cy + r * 0.18);
      ctx.stroke();

      // Disconnected side tassel
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.92, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.92, cy + r * 0.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r * 0.92, cy + r * 0.78, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 3: {
      // 4. Headphones (Arch + two earcups)
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.85, Math.PI, 0, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(cx - r * 0.95, cy - r * 0.05, r * 0.36, r * 0.75, r * 0.14);
      ctx.roundRect(cx + r * 0.59, cy - r * 0.05, r * 0.36, r * 0.75, r * 0.14);
      ctx.stroke();
      break;
    }

    case 4: {
      // 5. Wi-Fi Signal (3 disconnected concentric arcs + bottom dot)
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.55, r * (0.35 * i), Math.PI * 1.22, Math.PI * 1.78);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.68, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 5: {
      // 6. User Profile (Disconnected head circle + shoulder arch)
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.38, r * 0.38, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.95, r * 0.78, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    }

    case 6: {
      // 7. Padlock (Shackle arch + body + keyhole negative space)
      ctx.beginPath();
      ctx.roundRect(cx - r * 0.72, cy - r * 0.08, r * 1.44, r * 1.02, r * 0.2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.08, r * 0.45, Math.PI, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.38, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 7: {
      // 8. Notification Bell (Dome + disconnected bottom clapper)
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r * 0.58, Math.PI, 0);
      ctx.lineTo(cx + r * 0.75, cy + r * 0.48);
      ctx.lineTo(cx - r * 0.75, cy + r * 0.48);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.78, r * 0.16, 0, Math.PI);
      ctx.stroke();
      break;
    }

    case 8: {
      // 9. Mail Envelope
      ctx.beginPath();
      ctx.roundRect(cx - r * 0.92, cy - r * 0.62, r * 1.84, r * 1.24, r * 0.16);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy - r * 0.52);
      ctx.lineTo(cx, cy + r * 0.12);
      ctx.lineTo(cx + r * 0.85, cy - r * 0.52);
      ctx.stroke();
      break;
    }

    case 9: {
      // 10. Search Magnifier
      ctx.beginPath();
      ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + r * 0.32, cy + r * 0.32);
      ctx.lineTo(cx + r * 0.88, cy + r * 0.88);
      ctx.stroke();
      break;
    }

    case 10: {
      // 11. Cloud Icon
      ctx.beginPath();
      ctx.arc(cx - r * 0.38, cy + r * 0.15, r * 0.42, Math.PI * 0.5, Math.PI * 1.6);
      ctx.arc(cx + r * 0.08, cy - r * 0.22, r * 0.52, Math.PI * 1.1, Math.PI * 1.95);
      ctx.arc(cx + r * 0.52, cy + r * 0.18, r * 0.38, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 11: {
      // 12. Five-Pointed Star
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r * 0.95 : r * 0.42;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const px = cx + Math.cos(angle) * rad;
        const py = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 12: {
      // 13. Heart Icon
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.82);
      ctx.bezierCurveTo(cx - r * 1.2, cy + r * 0.1, cx - r * 0.95, cy - r * 0.85, cx, cy - r * 0.32);
      ctx.bezierCurveTo(cx + r * 0.95, cy - r * 0.85, cx + r * 1.2, cy + r * 0.1, cx, cy + r * 0.82);
      ctx.stroke();
      break;
    }

    case 13: {
      // 14. Settings Gear Wheel
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65);
        ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
        ctx.stroke();
      }
      break;
    }

    case 14: {
      // 15. Security Shield with Checkmark
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.92);
      ctx.lineTo(cx + r * 0.78, cy - r * 0.58);
      ctx.lineTo(cx + r * 0.78, cy + r * 0.08);
      ctx.quadraticCurveTo(cx + r * 0.78, cy + r * 0.75, cx, cy + r * 0.96);
      ctx.quadraticCurveTo(cx - r * 0.78, cy + r * 0.75, cx - r * 0.78, cy + r * 0.08);
      ctx.lineTo(cx - r * 0.78, cy - r * 0.58);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - r * 0.32, cy + r * 0.02);
      ctx.lineTo(cx - r * 0.06, cy + r * 0.28);
      ctx.lineTo(cx + r * 0.38, cy - r * 0.2);
      ctx.stroke();
      break;
    }

    case 15: {
      // 16. Trash Bin (Disconnected top lid + bin body + vertical slots)
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.82, cy - r * 0.52);
      ctx.lineTo(cx + r * 0.82, cy - r * 0.52);
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(cx - r * 0.62, cy - r * 0.32, r * 1.24, r * 1.18, r * 0.14);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - r * 0.2, cy - r * 0.05);
      ctx.lineTo(cx - r * 0.2, cy + r * 0.58);
      ctx.moveTo(cx + r * 0.2, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.2, cy + r * 0.58);
      ctx.stroke();
      break;
    }

    case 16: {
      // 17. Folder Icon
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, cy - r * 0.65);
      ctx.lineTo(cx - r * 0.25, cy - r * 0.65);
      ctx.lineTo(cx - r * 0.05, cy - r * 0.42);
      ctx.lineTo(cx + r * 0.9, cy - r * 0.42);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.68);
      ctx.lineTo(cx - r * 0.9, cy + r * 0.68);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 17:
    default: {
      // 18. Calendar Grid Icon (Frame + top rings + disconnected grid dots)
      ctx.beginPath();
      ctx.roundRect(cx - r * 0.85, cy - r * 0.68, r * 1.7, r * 1.48, r * 0.18);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy - r * 0.22);
      ctx.lineTo(cx + r * 0.85, cy - r * 0.22);
      ctx.stroke();

      for (const dx of [-0.38, 0, 0.38]) {
        for (const dy of [0.12, 0.44]) {
          ctx.beginPath();
          ctx.arc(cx + r * dx, cy + r * dy, r * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }

  ctx.restore();
}

/**
 * TEST 1: Single House Icon PNG (256x256)
 */
export async function generateSampleHouseIconFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 256, 256);
  drawSampleIconByIndex(ctx, 0, 128, 132, 210, '#0F172A');
  return canvasToFile(canvas, 'house_icon.png');
}

/**
 * TEST 2: Single Camera Icon PNG (256x256)
 */
export async function generateSampleCameraIconFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 256, 256);
  drawSampleIconByIndex(ctx, 1, 128, 128, 210, '#0F172A');
  return canvasToFile(canvas, 'camera_icon.png');
}

/**
 * TEST 3: 18-Icon Sheet arranged in 3 rows and 6 columns (1080x540)
 */
export async function generateSample18IconSheetFile(): Promise<File> {
  const rows = 3;
  const cols = 6;
  const cellW = 180;
  const cellH = 180;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d')!;

  // Clean white sheet background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;
      drawSampleIconByIndex(ctx, idx, cx, cy, 122, '#0F172A');
      idx++;
    }
  }

  return canvasToFile(canvas, 'icon_sheet_3x6_18icons.png');
}

/**
 * TEST 4: 100 Individual Icons Batch
 */
export async function generateSample100IconsBatch(): Promise<File[]> {
  const files: File[] = [];
  const iconNames = [
    'house', 'camera', 'grad_cap', 'headphones', 'wifi', 'user',
    'lock', 'bell', 'mail', 'search', 'cloud', 'star',
    'heart', 'gear', 'shield', 'trash', 'folder', 'calendar',
  ];

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 160, 160);
    drawSampleIconByIndex(ctx, i % 18, 80, 80, 124, '#0F172A');
    const label = iconNames[i % iconNames.length];
    const num = String(i + 1).padStart(3, '0');
    const file = await canvasToFile(canvas, `icon_${num}_${label}.png`);
    files.push(file);
  }

  return files;
}
