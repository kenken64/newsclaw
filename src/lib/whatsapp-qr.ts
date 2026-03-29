const QR_GLYPHS = [
  "█",
  "▀",
  "▄",
  "▐",
  "▌",
  "▖",
  "▗",
  "▘",
  "▙",
  "▚",
  "▛",
  "▜",
  "▝",
  "▞",
  "▟",
] as const;

const ANSI_QR_LINE_PATTERN = /(\x1b\[[0-9;]*m[ ]{2}){3,}/u;
const ANSI_ESCAPE = "\x1b";

function isQrLine(line: string) {
  return QR_GLYPHS.some((glyph) => line.includes(glyph)) || ANSI_QR_LINE_PATTERN.test(line);
}

export function extractLastQrBlock(output: string) {
  const lines = output.replace(/\r/g, "").split("\n");
  let lastStart: number | null = null;
  let lastEnd: number | null = null;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isQrLine(lines[index])) {
      if (lastEnd === null) {
        lastEnd = index;
      }

      lastStart = index;
      continue;
    }

    if (lastEnd !== null) {
      break;
    }
  }

  if (lastStart === null || lastEnd === null) {
    return output.replace(/\r/g, "").trim();
  }

  return lines.slice(lastStart, lastEnd + 1).join("\n").trim();
}

function parseAnsiQrRows(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  let startIndex = -1;
  let endIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (ANSI_QR_LINE_PATTERN.test(lines[index])) {
      if (startIndex === -1) {
        startIndex = index;
      }

      endIndex = index;
      continue;
    }

    if (startIndex !== -1) {
      break;
    }
  }

  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  const rows: boolean[][] = [];

  for (const line of lines.slice(startIndex, endIndex + 1)) {
    const modules: boolean[] = [];
    let backgroundIsDark = false;

    for (let index = 0; index < line.length;) {
      if (line[index] === ANSI_ESCAPE && line[index + 1] === "[") {
        const markerIndex = line.indexOf("m", index + 2);

        if (markerIndex === -1) {
          break;
        }

        const codes = line
          .slice(index + 2, markerIndex)
          .split(";")
          .map((value) => Number.parseInt(value, 10));

        for (const code of codes) {
          if (code === 0 || code === 49 || code === 27 || code === 47 || code === 107 || code === 97 || code === 37) {
            backgroundIsDark = false;
          } else if (
            code === 7 ||
            code === 40 ||
            code === 100 ||
            code === 41 ||
            code === 42 ||
            code === 43 ||
            code === 44 ||
            code === 45 ||
            code === 46
          ) {
            backgroundIsDark = true;
          }
        }

        index = markerIndex + 1;
        continue;
      }

      if (line[index] === " " && line[index + 1] === " ") {
        modules.push(backgroundIsDark);
        index += 2;
        continue;
      }

      index += 1;
    }

    if (modules.length >= 3) {
      rows.push(modules);
    }
  }

  if (rows.length >= 10 && rows[0]?.length >= 10) {
    return rows;
  }

  return null;
}

function pushUnicodeModule(rows: boolean[][], topDark: boolean, bottomDark: boolean) {
  if (rows.length === 0) {
    rows.push([]);
    rows.push([]);
  }

  rows[rows.length - 2].push(topDark);
  rows[rows.length - 1].push(bottomDark);
}

function parseUnicodeQrRows(text: string) {
  const qrBlock = extractLastQrBlock(text);
  const lines = qrBlock.split("\n").filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const rows: boolean[][] = [];

  for (const line of lines) {
    rows.push([]);
    rows.push([]);

    for (const character of line) {
      switch (character) {
        case "█":
        case "▌":
        case "▐":
        case "▙":
        case "▚":
        case "▛":
        case "▜":
        case "▞":
        case "▟":
          pushUnicodeModule(rows, true, true);
          break;
        case "▀":
        case "▘":
        case "▝":
          pushUnicodeModule(rows, true, false);
          break;
        case "▄":
        case "▖":
        case "▗":
          pushUnicodeModule(rows, false, true);
          break;
        default:
          pushUnicodeModule(rows, false, false);
          break;
      }
    }
  }

  const normalizedRows = rows.filter((row) => row.length > 0);

  if (normalizedRows.length >= 10 && normalizedRows[0]?.length >= 10) {
    return normalizedRows;
  }

  return null;
}

function isUniformRow(row: boolean[]) {
  if (row.length === 0) return true;
  const first = row[0];
  return row.every((v) => v === first);
}

function isUniformColumn(rows: boolean[][], colIndex: number) {
  if (rows.length === 0) return true;
  const first = rows[0][colIndex];
  return rows.every((row) => row[colIndex] === first);
}

function trimQrBorder(rows: boolean[][]) {
  if (rows.length === 0) return rows;

  let topTrim = 0;
  while (topTrim < rows.length && isUniformRow(rows[topTrim])) {
    topTrim += 1;
  }

  let bottomTrim = 0;
  while (bottomTrim < rows.length - topTrim && isUniformRow(rows[rows.length - 1 - bottomTrim])) {
    bottomTrim += 1;
  }

  let trimmed = rows.slice(topTrim, rows.length - bottomTrim);
  if (trimmed.length === 0) return rows;

  const width = trimmed[0].length;

  let leftTrim = 0;
  while (leftTrim < width && isUniformColumn(trimmed, leftTrim)) {
    leftTrim += 1;
  }

  let rightTrim = 0;
  while (rightTrim < width - leftTrim && isUniformColumn(trimmed, width - 1 - rightTrim)) {
    rightTrim += 1;
  }

  if (leftTrim > 0 || rightTrim > 0) {
    trimmed = trimmed.map((row) => row.slice(leftTrim, width - rightTrim));
  }

  return trimmed;
}

function autoInvertIfNeeded(rows: boolean[][]) {
  // A valid QR code's top-left finder pattern starts with a 7-module dark border.
  // If the top-left corner is light, the entire matrix is color-inverted.
  if (rows.length >= 7 && rows[0].length >= 7 && !rows[0][0]) {
    return rows.map((row) => row.map((v) => !v));
  }

  return rows;
}

export function parseQrTextToRows(text: string) {
  const raw = parseAnsiQrRows(text) ?? parseUnicodeQrRows(text);
  if (!raw) return null;
  const trimmed = trimQrBorder(raw);
  return trimmed.length >= 10 ? autoInvertIfNeeded(trimmed) : null;
}

export function drawQrRowsToCanvas(
  canvas: HTMLCanvasElement,
  rows: boolean[][],
  options?: {
    scale?: number;
    quietZone?: number;
  },
) {
  const scale = options?.scale ?? 8;
  const quietZone = options?.quietZone ?? 4;
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  const pixelWidth = (width + quietZone * 2) * scale;
  const pixelHeight = (height + quietZone * 2) * scale;
  const context = canvas.getContext("2d");

  if (!context || width === 0 || height === 0) {
    return;
  }

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = `${pixelWidth}px`;
  canvas.style.height = `${pixelHeight}px`;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pixelWidth, pixelHeight);

  context.fillStyle = "#000000";

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (!row[columnIndex]) {
        continue;
      }

      context.fillRect(
        (columnIndex + quietZone) * scale,
        (rowIndex + quietZone) * scale,
        scale,
        scale,
      );
    }
  }
}