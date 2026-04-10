/**
 * Ticket Generator for Caramba
 * Renders an order into a 384px wide canvas suitable for thermal printing.
 */

type Extra = { nombre: string; precio: number };
type OrderData = {
  codigo_ticket: string;
  cliente_nombre: string;
  cliente_direccion: string;
  cantidad_burritos: number;
  total: number;
  ingredientes: string[];
  extras: Extra[];
  dia_entrega: string;
  bloque_horario: string;
};

export async function generateTicketCanvas(order: OrderData): Promise<HTMLCanvasElement> {
  const width = 384;
  console.log('Generating ticket canvas for:', order.codigo_ticket);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  const ctx = canvas.getContext('2d')!;

  // We'll calculate height dynamically or just use a very tall one and clip
  // For simplicity, let's pre-calculate or use a safe margin
  let currentY = 0;

  // Helper to draw text
  const drawText = (text: string, size: number, x: number, y: number, align: 'left' | 'center' | 'right' = 'left', bold = false) => {
    ctx.font = `${bold ? 'bold' : ''} ${size}px 'Courier New', monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top'; // This prevents text from overlapping upwards
    ctx.fillStyle = 'black';
    ctx.fillText(text, x, y);
    return y + size + 4; // Return the NEXT Y coordinate (4px gap under text)
  };

  const drawLine = (y: number) => {
    ctx.beginPath();
    ctx.moveTo(0, y + 2); // Draw a bit below the current Y
    ctx.lineTo(width, y + 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'black';
    ctx.stroke();
    return y + 15; // Return next Y coordinate, leaving a 15px gap
  };

  // 1. Initial Height Estimation
  // This is a bit tricky, so we'll just set it large and crop later or draw twice.
  // Let's set it to 2000px and measure.
  canvas.height = 2000;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, 2000);

  // 2. Logo
  try {
    const logo = new Image();
    logo.src = '/printer-logo.png';
    await new Promise((resolve) => {
      logo.onload = resolve;
      logo.onerror = resolve; // Continue even if logo fails
    });
    if (logo.complete && logo.naturalWidth > 0) {
      console.log('Logo loaded successfully');
      const logoWidth = 200;
      const aspect = logo.naturalHeight / logo.naturalWidth;
      const logoHeight = logoWidth * aspect;
      ctx.drawImage(logo, (width - logoWidth) / 2, 10, logoWidth, logoHeight);
      currentY = 15 + logoHeight + 2; // Sets text literally right below the logo
    } else {
      console.warn('Logo could not be loaded, using text header');
      currentY = drawText('CARAMBA', 40, width / 2, 50, 'center', true);
    }
  } catch (e) {
    console.warn('Logo error:', e);
    currentY = drawText('CARAMBA', 40, width / 2, 50, 'center', true);
  }

  // 3. Header Info
  currentY = drawText('LOS DE LOS 20 CM', 13, width / 2, currentY, 'center');
  currentY = drawLine(currentY);

  //currentY = drawText(`TICKET: ${order.codigo_ticket}`, 32, width / 2, currentY, 'center', true);
  currentY = drawText(order.dia_entrega.toUpperCase(), 18, width / 2, currentY, 'center', true);
  currentY = drawText(order.bloque_horario, 16, width / 2, currentY, 'center');

  //currentY = drawLine(currentY);

  // 4. Client Info
  currentY = drawText('CLIENTE:', 14, 0, currentY, 'left', true);
  currentY = drawText(order.cliente_nombre.toUpperCase(), 24, 0, currentY, 'left', true);
  /*if (order.cliente_direccion) {
    currentY = drawText('ENTREGAR EN:', 14, 0, currentY + 10, 'left', true);
    // Wrap address
    const words = order.cliente_direccion.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + word).length > 25) {
        currentY = drawText(line, 18, 0, currentY, 'left');
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    }
    currentY = drawText(line, 18, 0, currentY, 'left');
  }*/

  //currentY = drawLine(currentY);

  // 5. Order Content
  currentY = drawText('PEDIDO:', 18, 0, currentY, 'left', true);

  // Split ingredients (mirroring logic from tickets/page.tsx)
  const ingredientes = order.ingredientes || [];
  const cantidad = order.cantidad_burritos || 1;
  const groups: string[][] = [];

  if (ingredientes.some(i => i.startsWith('---'))) {
    let current: string[] = [];
    for (const item of ingredientes) {
      if (item.startsWith('---')) {
        groups.push(current);
        current = [];
      } else {
        current.push(item);
      }
    }
    groups.push(current);
  } else {
    // Repeated for all
    for (let i = 0; i < cantidad; i++) groups.push([...ingredientes]);
  }

  groups.forEach((ings, idx) => {
    currentY += 10; // Extra spacing between burritos
    currentY = drawText(`${idx + 1}/${cantidad} BURRITO ARMA-LO`, 18, 0, currentY, 'left', true);
    // Wrap ingredients separated by commas
    const allIngs = ings.join(', ');
    const words = allIngs.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + word).length > 36) {
        currentY = drawText(line.trim(), 16, 20, currentY, 'left');
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line.trim()) {
      currentY = drawText(line.trim(), 16, 20, currentY, 'left');
    }
  });

  // Extras
  if (order.extras && order.extras.length > 0) {
    currentY += 10;
    currentY = drawText('EXTRAS:', 18, 0, currentY, 'left', true);
    order.extras.forEach(ext => {
      currentY = drawText(` + ${ext.nombre}`, 16, 20, currentY, 'left');
    });
  }

  currentY = drawLine(currentY);

  // 6. Total
  currentY = drawText('TOTAL A PAGAR:', 20, width, currentY, 'right', true);
  currentY = drawText(`$${Number(order.total).toFixed(2)}`, 48, width, currentY, 'right', true);

  currentY += 10;
  currentY = drawText('¡GRACIAS POR TU COMPRA!', 16, width / 2, currentY, 'center', true);
  currentY = drawText('@ec.caramba', 14, width / 2, currentY, 'center');
  currentY += 20;

  // 7. Etiquetas individuales para pegar en los burritos (solo si pide varios)
  if (cantidad > 1) {
    currentY += 40; // Espacio en blanco antes de las etiquetas
    for (let i = 1; i <= cantidad; i++) {
      currentY = drawLine(currentY); // Línea punteada de guía para corte con tijera
      currentY += 15;
      
      currentY = drawText(`BURRITO ${i}`, 32, width / 2, currentY, 'center', true);
      currentY += 5;
      currentY = drawText(`OT: ${order.codigo_ticket} - ${order.cliente_nombre?.split(' ')[0] || 'Cliente'}`, 16, width / 2, currentY, 'center');
      
      currentY += 50; // Margen seguro debajo para cortar
    }
  }

  // Create final cropped canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = currentY;
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.drawImage(canvas, 0, 0);

  console.log('Ticket canvas generated successfully. Height:', currentY);
  return finalCanvas;
}
