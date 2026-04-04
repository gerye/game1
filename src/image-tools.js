import { AVATAR_SIZE, FACTIONS } from "./config.js";
import { getBasePhotoSrc } from "./cap-asset-store.js";
import { average, clamp, hashString, rgbToHex, rgbToHsl, round1 } from "./utils.js";

const WORKING_MAX = 640;
const FOREGROUND_BLACK_THRESHOLD = 24;
const MIN_COMPONENT_AREA = 300;

export async function refreshBaseColorProfile(base) {
  const dataUrl = getBasePhotoSrc(base);
  if (!dataUrl) return base;
  let image = null;
  try {
    image = await loadImage(dataUrl);
  } catch (_error) {
    return base;
  }
  const canvas = imageToCanvas(image);
  const sample = sampleImage(canvas, 32);
  const autoMetrics = computePatternMetrics(sample.pixels, sample.size, sample.size);
  const metrics = base.metrics
    ? { ...base.metrics }
    : autoMetrics;
  const perceptualHash = buildPerceptualHash(sample.grayGrid);
  const featureSignature = buildFeatureSignature(sample.hsl, metrics, perceptualHash);
  return {
    ...base,
    dominantColor: sample.dominantColor,
    hsl: sample.hsl,
    baseFillHsl: sample.baseFillHsl,
    accentHsl: sample.accentHsl,
    whiteRatio: sample.whiteRatio,
    darkRatio: sample.darkRatio,
    metrics,
    perceptualHash,
    featureSignature
  };
}

export async function buildCapBaseRecords(file, sourceName, note = "") {
  const bitmap = await createImageBitmap(file);
  const normalized = extractSingleCap(bitmap);
  const sample = sampleImage(normalized.photoCanvas, 32);
  const metrics = computePatternMetrics(sample.pixels, sample.size, sample.size);
  const perceptualHash = buildPerceptualHash(sample.grayGrid);
  const featureSignature = buildFeatureSignature(sample.hsl, metrics, perceptualHash);
  const code = `CAP-${hashString(featureSignature).toString(16).padStart(8, "0").toUpperCase()}`;

  return [{
    code,
    sourceName: sourceName || "",
    note,
    avatarDataUrl: normalized.avatarDataUrl,
    photoDataUrl: normalized.photoDataUrl,
    dominantColor: sample.dominantColor,
    hsl: sample.hsl,
    baseFillHsl: sample.baseFillHsl,
    accentHsl: sample.accentHsl,
    whiteRatio: sample.whiteRatio,
    darkRatio: sample.darkRatio,
    metrics,
    perceptualHash,
    featureSignature,
    rotation: normalized.rotation,
    createdAt: Date.now(),
    regionIndex: 1,
    regionBounds: normalized.regionBounds
  }];
}

function normalizeCapBitmap(imageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  const square = Math.min(imageBitmap.width, imageBitmap.height);
  const sx = (imageBitmap.width - square) / 2;
  const sy = (imageBitmap.height - square) / 2;
  const rotation = estimateRotation(imageBitmap);
  ctx.save();
  ctx.translate(AVATAR_SIZE / 2, AVATAR_SIZE / 2);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(imageBitmap, sx, sy, square, square, -AVATAR_SIZE / 2, -AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);
  ctx.restore();
  return { canvas, rotation, dataUrl: canvas.toDataURL("image/png") };
}

function computePatternMetrics(pixels, width, height) {
  const validPixels = [];
  const featurePixels = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const normalized = Math.hypot(dx, dy) / (width * 0.5);
      if (normalized > 0.9) continue;
      const pixel = pixels[y * width + x];
      validPixels.push(pixel);
      if (normalized <= 0.78) featurePixels.push(pixel);
    }
  }
  const metricPixels = featurePixels.length ? featurePixels : validPixels;
  const meanGray = average(metricPixels.map((pixel) => pixel.gray));
  let varianceAccumulator = 0;
  let edgeAccumulator = 0;
  let radialCenter = 0;
  let radialRing = 0;
  let centerCount = 0;
  let ringCount = 0;
  const buckets = [[], [], [], []];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const normalized = Math.hypot(dx, dy) / (width * 0.5);
      if (normalized > 0.78) continue;
      const index = y * width + x;
      const pixel = pixels[index];
      varianceAccumulator += Math.pow(pixel.gray - meanGray, 2);
      const gx = x < width - 1 ? Math.abs(pixel.gray - pixels[index + 1].gray) : 0;
      const gy = y < height - 1 ? Math.abs(pixel.gray - pixels[index + width].gray) : 0;
      edgeAccumulator += Math.sqrt(gx * gx + gy * gy);
      if (normalized < 0.22) {
        radialCenter += pixel.gray;
        centerCount += 1;
      } else if (normalized < 0.52) {
        radialRing += pixel.gray;
        ringCount += 1;
      }
      if (normalized < 0.78) {
        const bucket = clamp(Math.floor(normalized * buckets.length), 0, buckets.length - 1);
        buckets[bucket].push(pixel.gray);
      }
    }
  }

  const bucketAverages = buckets.map((bucket) => average(bucket));
  const bucketVariance = average(bucketAverages.map((value) => Math.pow(value - meanGray, 2)));
  const contour = edgeAccumulator / Math.max(metricPixels.length, 1) + bucketVariance * 0.16;
  const mirrorSymmetry = computeMirrorSymmetry(pixels, width, height, 0.84);
  const rotationalSymmetry = computeRotationalSymmetry(pixels, width, height, 0.84);
  const palette = deriveStrictPalette(metricPixels);

  return {
    variance: round1(varianceAccumulator / Math.max(metricPixels.length, 1)),
    edgeDensity: round1(edgeAccumulator / Math.max(metricPixels.length, 1)),
    radialContrast: round1(Math.abs(radialCenter / Math.max(centerCount, 1) - radialRing / Math.max(ringCount, 1))),
    asymmetry: round1(100 - Math.max(mirrorSymmetry, rotationalSymmetry)),
    flourish: round1(contour * 0.46 + (varianceAccumulator / Math.max(metricPixels.length, 1)) * 0.05 + palette.richness * 10),
    stripeScore: round1(contour),
    mirrorSymmetry: round1(mirrorSymmetry),
    rotationalSymmetry: round1(rotationalSymmetry),
    mainColorCount: palette.count,
    colorRichness: round1(palette.richness * 100),
    colorCountScore: palette.count,
    patternComplexity: round1(clamp(
      normalizeUnit(edgeAccumulator / Math.max(metricPixels.length, 1), 8, 34) * 0.35 +
      normalizeUnit(contour, 10, 170) * 0.35 +
      normalizeUnit(varianceAccumulator / Math.max(metricPixels.length, 1), 16, 160) * 0.15 +
      normalizeUnit(Math.abs(radialCenter / Math.max(centerCount, 1) - radialRing / Math.max(ringCount, 1)), 10, 75) * 0.15,
      0,
      1
    ) * 100),
    patternSymmetry: round1(clamp((mirrorSymmetry * 0.55 + rotationalSymmetry * 0.45), 0, 100)),
    patternSymmetryTier: deriveSymmetryTier(mirrorSymmetry * 0.55 + rotationalSymmetry * 0.45)
  };
}

export function pickFactionFromBase(base) {
  const fill = base.baseFillHsl || base.hsl;
  const whiteRatio = base.whiteRatio ?? 0;
  const darkRatio = base.darkRatio ?? 0;
  if ((fill.s < 0.18 && fill.l > 0.5) || (whiteRatio > 0.48 && fill.l > 0.62 && fill.s < 0.24)) {
    return FACTIONS.find((faction) => faction.key === "palace") || FACTIONS[0];
  }
  if (darkRatio > 0.48 && fill.l < 0.24 && fill.s < 0.18) {
    return FACTIONS.find((faction) => faction.key === "soul") || FACTIONS[FACTIONS.length - 1];
  }
  const hue = Math.round(fill.h);
  const sat = Math.round(fill.s * 100);
  const light = Math.round(fill.l * 100);
  return FACTIONS.find((faction) => {
    const hueMatch = faction.hue[0] <= faction.hue[1]
      ? hue >= faction.hue[0] && hue <= faction.hue[1]
      : hue >= faction.hue[0] || hue <= faction.hue[1];
    return hueMatch && sat >= faction.sat[0] && sat <= faction.sat[1] && light >= faction.light[0] && light <= faction.light[1];
  }) || FACTIONS[FACTIONS.length - 1];
}

export function isLikelySameCap(left, right) {
  if (left.code === right.code) return true;
  const hueGap = Math.abs(Math.round(left.hsl.h / 10) - Math.round(right.hsl.h / 10));
  const hamming = getHammingDistance(left.perceptualHash, right.perceptualHash);
  const varianceGap = Math.abs(left.metrics.variance - right.metrics.variance);
  const flourishGap = Math.abs(left.metrics.flourish - right.metrics.flourish);
  return hueGap <= 1 && hamming <= 24 && varianceGap < 10 && flourishGap < 10;
}

function extractSingleCap(imageBitmap) {
  const working = buildWorkingImage(imageBitmap);
  const mask = buildForegroundMask(working);
  const component = findLargestComponent(mask, working.width, working.height);
  if (!component) {
    return fallbackNormalization(imageBitmap);
  }

  const ellipse = fitEllipse(component.points, working.scale, imageBitmap.width, imageBitmap.height);
  const rectified = rectifyEllipseToCircle(imageBitmap, ellipse);
  const normalizedPhoto = normalizeCapBitmap(rectified.canvas);
  const avatarCanvas = enhanceAvatar(normalizedPhoto.canvas);

  return {
    photoCanvas: normalizedPhoto.canvas,
    avatarCanvas,
    rotation: ellipse.angle,
    photoDataUrl: normalizedPhoto.dataUrl,
    avatarDataUrl: avatarCanvas.toDataURL("image/png"),
    regionBounds: ellipse.regionBounds
  };
}

function imageToCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return canvas;
}

function fallbackNormalization(imageBitmap) {
  const normalizedPhoto = normalizeCapBitmap(imageBitmap);
  const avatarCanvas = enhanceAvatar(normalizedPhoto.canvas);
  return {
    photoCanvas: normalizedPhoto.canvas,
    avatarCanvas,
    rotation: 0,
    photoDataUrl: normalizedPhoto.dataUrl,
    avatarDataUrl: avatarCanvas.toDataURL("image/png"),
    regionBounds: {
      x: 0,
      y: 0,
      size: Math.min(imageBitmap.width, imageBitmap.height)
    }
  };
}

function buildWorkingImage(imageBitmap) {
  const scale = Math.min(1, WORKING_MAX / Math.max(imageBitmap.width, imageBitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
  canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    canvas,
    scale,
    width: canvas.width,
    height: canvas.height,
    data
  };
}

function buildForegroundMask(working) {
  const mask = new Uint8Array(working.width * working.height);
  for (let y = 0; y < working.height; y += 1) {
    for (let x = 0; x < working.width; x += 1) {
      const index = (y * working.width + x) * 4;
      const r = working.data[index];
      const g = working.data[index + 1];
      const b = working.data[index + 2];
      const brightness = Math.max(r, g, b);
      if (brightness > FOREGROUND_BLACK_THRESHOLD) {
        mask[y * working.width + x] = 1;
      }
    }
  }
  return closeMask(openMask(mask, working.width, working.height), working.width, working.height);
}

function findLargestComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;

      const stack = [[x, y]];
      const points = [];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        points.push([cx, cy]);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nextIndex = ny * width + nx;
          if (!mask[nextIndex] || visited[nextIndex]) continue;
          visited[nextIndex] = 1;
          stack.push([nx, ny]);
        }
      }

      if (points.length < MIN_COMPONENT_AREA) continue;
      const candidate = {
        points,
        area: points.length,
        minX,
        maxX,
        minY,
        maxY
      };

      if (!best || candidate.area > best.area) best = candidate;
    }
  }

  return best;
}

function fitEllipse(points, scale, sourceWidth, sourceHeight) {
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
  }
  const cx = sumX / points.length;
  const cy = sumY / points.length;

  let covXX = 0;
  let covYY = 0;
  let covXY = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    covXX += dx * dx;
    covYY += dy * dy;
    covXY += dx * dy;
  }
  covXX /= points.length;
  covYY /= points.length;
  covXY /= points.length;

  const trace = covXX + covYY;
  const detTerm = Math.sqrt(Math.max(0, (covXX - covYY) * (covXX - covYY) + 4 * covXY * covXY));
  const lambda1 = (trace + detTerm) / 2;
  const lambda2 = (trace - detTerm) / 2;
  const angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);

  const axis1 = { x: Math.cos(angle), y: Math.sin(angle) };
  const axis2 = { x: -Math.sin(angle), y: Math.cos(angle) };

  let maxProj1 = 0;
  let maxProj2 = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    maxProj1 = Math.max(maxProj1, Math.abs(dx * axis1.x + dy * axis1.y));
    maxProj2 = Math.max(maxProj2, Math.abs(dx * axis2.x + dy * axis2.y));
  }

  const radiusMajor = Math.max(maxProj1, Math.sqrt(Math.max(lambda1, 1)) * 2.2);
  const radiusMinor = Math.max(maxProj2, Math.sqrt(Math.max(lambda2, 1)) * 2.2);
  const sourceCx = cx / scale;
  const sourceCy = cy / scale;
  const sourceMajor = radiusMajor / scale;
  const sourceMinor = radiusMinor / scale;
  const maxRadius = Math.min(sourceWidth, sourceHeight) * 0.48;

  return {
    cx: clamp(sourceCx, 0, sourceWidth),
    cy: clamp(sourceCy, 0, sourceHeight),
    radiusMajor: clamp(sourceMajor * 1.03, 8, maxRadius),
    radiusMinor: clamp(sourceMinor * 1.03, 8, maxRadius),
    angle,
    regionBounds: {
      x: clamp(Math.round(sourceCx - sourceMajor * 1.2), 0, sourceWidth),
      y: clamp(Math.round(sourceCy - sourceMinor * 1.2), 0, sourceHeight),
      size: Math.round(Math.max(sourceMajor, sourceMinor) * 2.4)
    }
  };
}

function rectifyEllipseToCircle(source, ellipse) {
  const radius = Math.max(ellipse.radiusMajor, ellipse.radiusMinor);
  const outputSize = Math.max(AVATAR_SIZE, Math.round(radius * 2.5));
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = source.width;
  sourceCanvas.height = source.height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(source, 0, 0);
  const sourceData = sourceCtx.getImageData(0, 0, source.width, source.height).data;
  const image = ctx.createImageData(outputSize, outputSize);

  const rimScale = 1.06;
  const outputRadius = outputSize * 0.38;
  for (let y = 0; y < outputSize; y += 1) {
    for (let x = 0; x < outputSize; x += 1) {
      const nx = (x - outputSize / 2) / outputRadius;
      const ny = (y - outputSize / 2) / outputRadius;
      const distance = Math.hypot(nx, ny);
      const outIndex = (y * outputSize + x) * 4;
      if (distance > rimScale) {
        image.data[outIndex + 3] = 0;
        continue;
      }

      const localX = nx * ellipse.radiusMajor;
      const localY = ny * ellipse.radiusMinor;
      const cos = Math.cos(ellipse.angle);
      const sin = Math.sin(ellipse.angle);
      const sourceX = ellipse.cx + localX * cos - localY * sin;
      const sourceY = ellipse.cy + localX * sin + localY * cos;
      const pixel = samplePixelBilinear(sourceData, source.width, source.height, sourceX, sourceY);
      const feather = clamp((rimScale - distance) / 0.08, 0, 1);

      image.data[outIndex] = pixel.r;
      image.data[outIndex + 1] = pixel.g;
      image.data[outIndex + 2] = pixel.b;
      image.data[outIndex + 3] = Math.round(pixel.a * feather);
    }
  }

  ctx.putImageData(image, 0, 0);
  return { canvas };
}

function enhanceAvatar(photoCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = photoCanvas.width;
  canvas.height = photoCanvas.height;
  const ctx = canvas.getContext("2d");
  const srcCtx = photoCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = srcCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha <= 0) continue;
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const satBoost = hsl.s < 0.12 ? 1 : 1.06;
    const lightBoost = hsl.l > 0.7 ? 1.03 : 1;
    data[i] = clamp(Math.round(data[i] * satBoost * lightBoost), 0, 255);
    data[i + 1] = clamp(Math.round(data[i + 1] * satBoost * lightBoost), 0, 255);
    data[i + 2] = clamp(Math.round(data[i + 2] * satBoost * lightBoost), 0, 255);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function estimateRotation(imageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, 48, 48);
  const { data } = ctx.getImageData(0, 0, 48, 48);
  let weightedX = 0;
  let weightedY = 0;
  let total = 0;
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const index = (y * 48 + x) * 4;
      const gray = (data[index] + data[index + 1] + data[index + 2]) / 3;
      const alpha = data[index + 3] / 255;
      const weight = alpha * Math.abs(gray - 127);
      weightedX += (x - 24) * weight;
      weightedY += (y - 24) * weight;
      total += weight;
    }
  }
  if (total < 1) return 0;
  return Math.atan2(weightedY / total, weightedX / total) * 0.18;
}

function sampleImage(canvas, size) {
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = size;
  sampleCanvas.height = size;
  const ctx = sampleCanvas.getContext("2d");
  ctx.drawImage(canvas, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const pixels = [];
  const grayGrid = [];
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  const centerSamples = [];
  const ringSamples = [];
  let whiteCount = 0;
  let darkCount = 0;
  let accentHueX = 0;
  let accentHueY = 0;
  let accentSat = 0;
  let accentLight = 0;
  let accentWeight = 0;
  for (let y = 0; y < size; y += 1) {
    const row = [];
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const alpha = data[index + 3] / 255;
      const r = Math.round(data[index] * alpha + 245 * (1 - alpha));
      const g = Math.round(data[index + 1] * alpha + 241 * (1 - alpha));
      const b = Math.round(data[index + 2] * alpha + 233 * (1 - alpha));
      const gray = (r + g + b) / 3;
      const hsl = rgbToHsl(r, g, b);
      const dx = x - size / 2;
      const dy = y - size / 2;
      const distance = Math.hypot(dx, dy) / (size * 0.5);
      totalR += r;
      totalG += g;
      totalB += b;
      if (distance < 0.68 && alpha > 0.2) {
        centerSamples.push({ r, g, b, gray });
      }
      if (distance >= 0.42 && distance <= 0.82 && alpha > 0.45) {
        ringSamples.push({ r, g, b, gray, hsl });
      }
      if (gray > 215 && hsl.s < 0.18) whiteCount += 1;
      if (gray < 72) darkCount += 1;
      if (hsl.s >= 0.18 && gray > 45) {
        const weight = alpha * (0.4 + hsl.s);
        const rad = (hsl.h / 180) * Math.PI;
        accentHueX += Math.cos(rad) * weight;
        accentHueY += Math.sin(rad) * weight;
        accentSat += hsl.s * weight;
        accentLight += hsl.l * weight;
        accentWeight += weight;
      }
      pixels.push({ r, g, b, gray });
      row.push(gray);
    }
    grayGrid.push(row);
  }
  const count = size * size;
  const averageHsl = rgbToHsl(totalR / count, totalG / count, totalB / count);
  const baseFillHsl = deriveBaseFillHsl(ringSamples, centerSamples, averageHsl);
  return {
    size,
    pixels,
    grayGrid,
    dominantColor: rgbToHex(totalR / count, totalG / count, totalB / count),
    hsl: averageHsl,
    baseFillHsl,
    accentHsl: accentWeight > 0 ? {
      h: normalizeHue((Math.atan2(accentHueY, accentHueX) * 180) / Math.PI),
      s: accentSat / accentWeight,
      l: accentLight / accentWeight
    } : averageHsl,
    whiteRatio: whiteCount / count,
    darkRatio: darkCount / count
  };
}

function samplePixelBilinear(data, width, height, x, y) {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);

  const a = readPixel(data, width, x0, y0);
  const b = readPixel(data, width, x1, y0);
  const c = readPixel(data, width, x0, y1);
  const d = readPixel(data, width, x1, y1);

  return {
    r: bilerp(a.r, b.r, c.r, d.r, tx, ty),
    g: bilerp(a.g, b.g, c.g, d.g, tx, ty),
    b: bilerp(a.b, b.b, c.b, d.b, tx, ty),
    a: bilerp(a.a, b.a, c.a, d.a, tx, ty)
  };
}

function bilerp(a, b, c, d, tx, ty) {
  return Math.round(a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty);
}

function normalizeHue(hue) {
  let value = hue % 360;
  if (value < 0) value += 360;
  return value;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function deriveBaseFillHsl(ringSamples, centerSamples, fallback) {
  const preferred = ringSamples.filter((sample) => sample.hsl.s < 0.42 || sample.gray > 150);
  const samples = preferred.length >= 24 ? preferred : (ringSamples.length ? ringSamples : centerSamples);
  if (!samples.length) return fallback;
  const sorted = [...samples].sort((left, right) => left.gray - right.gray);
  const start = Math.floor(sorted.length * 0.18);
  const end = Math.max(start + 1, Math.ceil(sorted.length * 0.82));
  const trimmed = sorted.slice(start, end);
  if (!trimmed.length) return fallback;
  const r = average(trimmed.map((sample) => sample.r));
  const g = average(trimmed.map((sample) => sample.g));
  const b = average(trimmed.map((sample) => sample.b));
  return rgbToHsl(r, g, b);
}

function computeMirrorSymmetry(pixels, width, height, maxRadius = 1) {
  let score = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < Math.floor(width / 2); x += 1) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      if (Math.hypot(dx, dy) / (width * 0.5) > maxRadius) continue;
      const left = pixels[y * width + x];
      const right = pixels[y * width + (width - 1 - x)];
      const diff = Math.abs(left.gray - right.gray);
      score += 1 - clamp(diff / 120, 0, 1);
      count += 1;
    }
  }
  return (score / Math.max(count, 1)) * 100;
}

function computeRotationalSymmetry(pixels, width, height, maxRadius = 1) {
  let score = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      if (Math.hypot(dx, dy) / (width * 0.5) > maxRadius) continue;
      const oppositeX = width - 1 - x;
      const oppositeY = height - 1 - y;
      const a = pixels[y * width + x];
      const b = pixels[oppositeY * width + oppositeX];
      const diff = Math.abs(a.gray - b.gray);
      score += 1 - clamp(diff / 120, 0, 1);
      count += 1;
    }
  }
  return (score / Math.max(count, 1)) * 100;
}

function deriveStrictPalette(pixels) {
  const bins = new Map();
  pixels.forEach((pixel) => {
    const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
    const key = hsl.s < 0.1
      ? `n-${Math.round(hsl.l * 6)}`
      : [
        `h${Math.round(normalizeHue(hsl.h) / 18)}`,
        `s${Math.round(hsl.s / 0.18)}`,
        `l${Math.round(hsl.l / 0.18)}`
      ].join("-");
    const current = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += pixel.r;
    current.g += pixel.g;
    current.b += pixel.b;
    current.count += 1;
    bins.set(key, current);
  });

  const total = pixels.length || 1;
  const merged = [];
  [...bins.values()]
    .map((bin) => ({
      r: bin.r / bin.count,
      g: bin.g / bin.count,
      b: bin.b / bin.count,
      count: bin.count,
      share: bin.count / total,
      hsl: rgbToHsl(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count)
    }))
    .filter((bin) => bin.share >= (bin.hsl.s < 0.1 ? 0.11 : 0.05))
    .sort((left, right) => right.share - left.share)
    .forEach((bin) => {
      const existing = merged.find((item) => {
        const threshold = item.hsl.s < 0.1 || bin.hsl.s < 0.1 ? 34 : 56;
        return colorDistance(item, bin) < threshold;
      });
      if (existing) {
        const totalCount = existing.count + bin.count;
        existing.r = (existing.r * existing.count + bin.r * bin.count) / totalCount;
        existing.g = (existing.g * existing.count + bin.g * bin.count) / totalCount;
        existing.b = (existing.b * existing.count + bin.b * bin.count) / totalCount;
        existing.count = totalCount;
        existing.share = totalCount / total;
        existing.hsl = rgbToHsl(existing.r, existing.g, existing.b);
        return;
      }
      merged.push({ ...bin });
    });

  const major = merged.filter((item) => item.share >= (item.hsl.s < 0.1 ? 0.13 : 0.07));
  const sortedMajor = [...major].sort((left, right) => right.share - left.share);
  const verifiedMajor = sortedMajor.filter((item, index) => {
    if (index < 2) return true;
    return item.share >= 0.07 && sortedMajor.slice(0, index).every((other) => colorDistance(item, other) >= (item.hsl.s < 0.1 ? 36 : 64));
  });
  return {
    count: verifiedMajor.length,
    richness: verifiedMajor.length <= 1
      ? 0
      : Math.min(
          1,
          ((verifiedMajor.length - 1) / 3) *
          average(verifiedMajor.map((item) => item.share)) *
          (1 + average(verifiedMajor.map((item) => Math.max(0.15, item.hsl.s))))
        )
  };
}

function colorDistance(left, right) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

function normalizeUnit(value, min, max) {
  return clamp((value - min) / Math.max(1e-9, max - min), 0, 1);
}

function deriveSymmetryTier(value = 0) {
  const safe = clamp(value, 0, 100);
  if (safe < 35) return 0;
  if (safe < 60) return 1;
  if (safe < 82) return 2;
  return 3;
}

function readPixel(data, width, x, y) {
  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    a: data[index + 3]
  };
}

function openMask(mask, width, height) {
  return dilateMask(erodeMask(mask, width, height), width, height);
}

function closeMask(mask, width, height) {
  return erodeMask(dilateMask(mask, width, height), width, height);
}

function erodeMask(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let keep = 1;
      for (let dy = -1; dy <= 1 && keep; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!mask[(y + dy) * width + (x + dx)]) {
            keep = 0;
            break;
          }
        }
      }
      output[y * width + x] = keep;
    }
  }
  return output;
}

function dilateMask(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let fill = 0;
      for (let dy = -1; dy <= 1 && !fill; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (mask[(y + dy) * width + (x + dx)]) {
            fill = 1;
            break;
          }
        }
      }
      output[y * width + x] = fill;
    }
  }
  return output;
}

function buildPerceptualHash(grayGrid) {
  let bits = "";
  for (let y = 0; y < grayGrid.length; y += 1) {
    for (let x = 1; x < grayGrid[y].length; x += 1) {
      bits += grayGrid[y][x - 1] > grayGrid[y][x] ? "1" : "0";
    }
  }
  return bits;
}

function buildFeatureSignature(hsl, metrics, perceptualHash) {
  const featureBands = [
    Math.round(hsl.h / 12),
    Math.round(hsl.s * 20),
    Math.round(hsl.l * 20),
    Math.round(metrics.variance / 4),
    Math.round(metrics.edgeDensity / 2),
    Math.round(metrics.radialContrast / 3),
    Math.round(metrics.asymmetry / 3),
    Math.round(metrics.flourish / 3)
  ];
  const hashChunks = [];
  for (let index = 0; index < 10; index += 1) {
    hashChunks.push(perceptualHash.slice(index * 9, index * 9 + 9));
  }
  return [...featureBands, ...hashChunks].join("-");
}

function getHammingDistance(left, right) {
  const length = Math.min(left.length, right.length);
  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance + Math.abs(left.length - right.length);
}
