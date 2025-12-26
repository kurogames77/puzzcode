// File: JigsawCodePuzzle.tsx
// @ts-nocheck
/* eslint-disable */
import React, { useCallback, useMemo, useRef, useState } from "react";

type Block = {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
};

// Removed hardcoded initialBlocks - always use initialTexts from props
// This ensures database lessons are always used instead of fallback blocks
const initialBlocks: Block[] = [];

const defaultExtraPool = [
  "y = x * 2  # integer",
  "temp = 99  # integer",
  "flag = False  # boolean",
  "items = [1, 2, 3]  # list",
  "print('hello')  # output"
];
// Text wrapping and layout helpers so sockets and rendering agree
function getFontSize(scale: number) {
  return Math.max(10, Math.round(13 * scale));
}

function wrapTextToWidth(text: string, maxCharsPerLine: number) {
  const words = String(text || '').split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      if (word.length <= maxCharsPerLine) {
        current = word;
      } else {
        // hard-wrap long word
        for (let i = 0; i < word.length; i += maxCharsPerLine) {
          lines.push(word.slice(i, i + maxCharsPerLine));
        }
        current = '';
      }
      continue;
    }
    if ((current.length + 1 + word.length) <= maxCharsPerLine) {
      current += ' ' + word;
    } else {
      lines.push(current);
      if (word.length <= maxCharsPerLine) {
        current = word;
      } else {
        for (let i = 0; i < word.length; i += maxCharsPerLine) {
          lines.push(word.slice(i, i + maxCharsPerLine));
        }
        current = '';
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function computeBlockLayout(text: string, scale = 1) {
  const textLen = (text || '').length;
  const baseUnscaledW = Math.max(180, Math.min(640, 120 + textLen * 8));
  const fontSize = getFontSize(scale);
  const padding = 12 * scale;
  const approxCharW = fontSize * 0.6; // rough width for monospace
  const initialW = Math.round(baseUnscaledW * scale);
  const maxChars = Math.max(8, Math.floor((initialW - 2 * padding) / approxCharW));
  const lines = wrapTextToWidth(text, maxChars);
  // Recompute width based on longest line for better fit
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const desiredInner = longest * approxCharW + 2 * padding;
  const w = Math.min(Math.max(initialW, Math.round(desiredInner)), Math.round(640 * scale));
  const lineHeight = fontSize + Math.round(6 * scale);
  const baseH = Math.round(60 * scale);
  const h = Math.max(baseH, Math.round(40 * scale + lines.length * lineHeight));
  return { w, h, lines, fontSize, lineHeight, padding };
}

function hashStringArray(values: string[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const str = String(value || '');
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
      hash >>>= 0;
    }
  }
  return hash >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) {
    r = c; g = x; b = 0;
  } else if (hp >= 1 && hp < 2) {
    r = x; g = c; b = 0;
  } else if (hp >= 2 && hp < 3) {
    r = 0; g = c; b = x;
  } else if (hp >= 3 && hp < 4) {
    r = 0; g = x; b = c;
  } else if (hp >= 4 && hp < 5) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }
  const toHex = (v: number) => {
    const out = Math.round((v + m) * 255);
    return out.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function createRng(seed: number) {
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
}

const fallbackPalette = ['#5b9bd5', '#70ad47', '#ed7d31', '#ffc000', '#4472c4', '#8e44ad', '#16a085', '#e67e22', '#c0392b', '#2ecc71'];

function generateColorPalette(lines: string[], count: number): string[] {
  if (!count) return [];
  const seed = hashStringArray(lines);
  const rng = createRng(seed || 1);
  const baseHue = Math.floor(rng() * 360);
  const palette: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (baseHue + i * 47 + Math.floor(rng() * 60)) % 360;
    const sat = 0.55 + rng() * 0.25;
    const light = 0.45 + rng() * 0.2;
    palette.push(hslToHex(hue, sat, light));
  }
  return palette;
}

type Side = 'top' | 'bottom' | 'left' | 'right';
type Connections = { [id: number]: Partial<Record<Side, number>> };

type PatternSides = { top: boolean; right: boolean; bottom: boolean; left: boolean };

type Placement = Block & { layout: ReturnType<typeof computeBlockLayout> };

function PuzzleBlock({ block, onPointerDown, highlight, scale, pattern, tabScale = 1 }: { block: Block; onPointerDown: (id: number, e: React.PointerEvent) => void; highlight?: boolean; scale: number; pattern: PatternSides; tabScale?: number }) {
  // Dynamic size based on text length
  const layout = computeBlockLayout(block.text, scale);
  const size = { w: layout.w, h: layout.h };
  
  // Jigsaw puzzle piece parameters
  const tabSize = 14 * scale * tabScale; // Size of tab/knob (cleaner proportion)
  const tabRadius = 6 * scale * tabScale; // Radius for smooth curves
  const padding = layout.padding; // Padding for text
  
  // pattern is provided by parent for dynamic shaping
  
  // Build SVG path for jigsaw piece
  const buildJigsawPath = () => {
    const w = size.w;
    const h = size.h;
    const t = tabSize;
    const r = tabRadius;
    const centerX = w / 2;
    const centerY = h / 2;
    
    let path = '';
    
    // Start at top-left corner
    path += `M 0 ${r}`;
    path += `Q 0 0 ${r} 0`;
    
    // Top edge
    const topShape: any = (pattern as any).top;
    if (topShape === true || topShape === 'tab') {
      // Top tab (protrusion)
      path += ` L ${centerX - t / 2 - r} 0`;
      path += ` Q ${centerX - t / 2} 0 ${centerX - t / 2} ${-r}`;
      path += ` L ${centerX - t / 2} ${-t + r}`;
      path += ` Q ${centerX - t / 2} ${-t} ${centerX - t / 2 + r} ${-t}`;
      path += ` L ${centerX + t / 2 - r} ${-t}`;
      path += ` Q ${centerX + t / 2} ${-t} ${centerX + t / 2} ${-t + r}`;
      path += ` L ${centerX + t / 2} ${-r}`;
      path += ` Q ${centerX + t / 2} 0 ${centerX + t / 2 + r} 0`;
    } else if (topShape === false || topShape === 'slot') {
      // Top slot (indentation)
      path += ` L ${centerX - t / 2 - r} 0`;
      path += ` Q ${centerX - t / 2} 0 ${centerX - t / 2} ${r}`;
      path += ` L ${centerX - t / 2} ${t - r}`;
      path += ` Q ${centerX - t / 2} ${t} ${centerX - t / 2 + r} ${t}`;
      path += ` L ${centerX + t / 2 - r} ${t}`;
      path += ` Q ${centerX + t / 2} ${t} ${centerX + t / 2} ${t - r}`;
      path += ` L ${centerX + t / 2} ${r}`;
      path += ` Q ${centerX + t / 2} 0 ${centerX + t / 2 + r} 0`;
    } else {
      // flat top – do nothing special; the straight segment to top-right will be added below
    }
    
    path += ` L ${w - r} 0`;
    path += ` Q ${w} 0 ${w} ${r}`;
    
    // Right edge
    const rightShape: any = (pattern as any).right;
    if (rightShape === true || rightShape === 'tab') {
      // Right tab
      path += ` L ${w} ${centerY - t / 2 - r}`;
      path += ` Q ${w} ${centerY - t / 2} ${w + r} ${centerY - t / 2}`;
      path += ` L ${w + t - r} ${centerY - t / 2}`;
      path += ` Q ${w + t} ${centerY - t / 2} ${w + t} ${centerY - t / 2 + r}`;
      path += ` L ${w + t} ${centerY + t / 2 - r}`;
      path += ` Q ${w + t} ${centerY + t / 2} ${w + t - r} ${centerY + t / 2}`;
      path += ` L ${w + r} ${centerY + t / 2}`;
      path += ` Q ${w} ${centerY + t / 2} ${w} ${centerY + t / 2 + r}`;
    } else if (rightShape === false || rightShape === 'slot') {
      // Right slot
      path += ` L ${w} ${centerY - t / 2 - r}`;
      path += ` Q ${w} ${centerY - t / 2} ${w - r} ${centerY - t / 2}`;
      path += ` L ${w - t + r} ${centerY - t / 2}`;
      path += ` Q ${w - t} ${centerY - t / 2} ${w - t} ${centerY - t / 2 + r}`;
      path += ` L ${w - t} ${centerY + t / 2 - r}`;
      path += ` Q ${w - t} ${centerY + t / 2} ${w - t + r} ${centerY + t / 2}`;
      path += ` L ${w - r} ${centerY + t / 2}`;
      path += ` Q ${w} ${centerY + t / 2} ${w} ${centerY + t / 2 + r}`;
    } else {
      // flat right – rely on the common corner lines below
    }
    
    path += ` L ${w} ${h - r}`;
    path += ` Q ${w} ${h} ${w - r} ${h}`;
    
    // Bottom edge
    const bottomShape: any = (pattern as any).bottom;
    if (bottomShape === true || bottomShape === 'tab') {
      // Bottom tab
      path += ` L ${centerX + t / 2 + r} ${h}`;
      path += ` Q ${centerX + t / 2} ${h} ${centerX + t / 2} ${h + r}`;
      path += ` L ${centerX + t / 2} ${h + t - r}`;
      path += ` Q ${centerX + t / 2} ${h + t} ${centerX + t / 2 - r} ${h + t}`;
      path += ` L ${centerX - t / 2 + r} ${h + t}`;
      path += ` Q ${centerX - t / 2} ${h + t} ${centerX - t / 2} ${h + t - r}`;
      path += ` L ${centerX - t / 2} ${h + r}`;
      path += ` Q ${centerX - t / 2} ${h} ${centerX - t / 2 - r} ${h}`;
    } else if (bottomShape === false || bottomShape === 'slot') {
      // Bottom slot
      path += ` L ${centerX + t / 2 + r} ${h}`;
      path += ` Q ${centerX + t / 2} ${h} ${centerX + t / 2} ${h - r}`;
      path += ` L ${centerX + t / 2} ${h - t + r}`;
      path += ` Q ${centerX + t / 2} ${h - t} ${centerX + t / 2 - r} ${h - t}`;
      path += ` L ${centerX - t / 2 + r} ${h - t}`;
      path += ` Q ${centerX - t / 2} ${h - t} ${centerX - t / 2} ${h - t + r}`;
      path += ` L ${centerX - t / 2} ${h - r}`;
      path += ` Q ${centerX - t / 2} ${h} ${centerX - t / 2 - r} ${h}`;
    } else {
      // flat bottom – rely on the common corner lines below
    }
    
    path += ` L ${r} ${h}`;
    path += ` Q 0 ${h} 0 ${h - r}`;
    
    // Left edge
    const leftShape: any = (pattern as any).left;
    if (leftShape === true || leftShape === 'tab') {
      // Left tab
      path += ` L 0 ${centerY + t / 2 + r}`;
      path += ` Q 0 ${centerY + t / 2} ${-r} ${centerY + t / 2}`;
      path += ` L ${-t + r} ${centerY + t / 2}`;
      path += ` Q ${-t} ${centerY + t / 2} ${-t} ${centerY + t / 2 - r}`;
      path += ` L ${-t} ${centerY - t / 2 + r}`;
      path += ` Q ${-t} ${centerY - t / 2} ${-t + r} ${centerY - t / 2}`;
      path += ` L ${-r} ${centerY - t / 2}`;
      path += ` Q 0 ${centerY - t / 2} 0 ${centerY - t / 2 - r}`;
    } else if (leftShape === false || leftShape === 'slot') {
      // Left slot
      path += ` L 0 ${centerY + t / 2 + r}`;
      path += ` Q 0 ${centerY + t / 2} ${r} ${centerY + t / 2}`;
      path += ` L ${t - r} ${centerY + t / 2}`;
      path += ` Q ${t} ${centerY + t / 2} ${t} ${centerY + t / 2 - r}`;
      path += ` L ${t} ${centerY - t / 2 + r}`;
      path += ` Q ${t} ${centerY - t / 2} ${t - r} ${centerY - t / 2}`;
      path += ` L ${r} ${centerY - t / 2}`;
      path += ` Q 0 ${centerY - t / 2} 0 ${centerY - t / 2 - r}`;
    } else {
      // flat left – rely on the final line to close shape
    }
    
    path += ` L 0 ${r}`;
    path += ' Z';
    
    return path;
  };

  const path = buildJigsawPath();
  const isTab = (s: any) => s === true || s === 'tab'
  const extraWidth = (isTab((pattern as any).left) ? tabSize : 0) + (isTab((pattern as any).right) ? tabSize : 0);
  const extraHeight = (isTab((pattern as any).top) ? tabSize : 0) + (isTab((pattern as any).bottom) ? tabSize : 0);
  const viewBoxX = isTab((pattern as any).left) ? -tabSize : 0;
  const viewBoxY = isTab((pattern as any).top) ? -tabSize : 0;
  const viewBoxW = size.w + (isTab((pattern as any).left) ? tabSize : 0) + (isTab((pattern as any).right) ? tabSize : 0);
  const viewBoxH = size.h + (isTab((pattern as any).top) ? tabSize : 0) + (isTab((pattern as any).bottom) ? tabSize : 0);

  return (
    <svg
      onPointerDown={(e) => onPointerDown(block.id, e)}
      width={size.w + extraWidth}
      height={size.h + extraHeight}
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
      style={{ 
        position: 'absolute', 
        top: Math.max(0, block.y + (isTab((pattern as any).top) ? -tabSize : 0)), 
        left: Math.max(0, block.x + (isTab((pattern as any).left) ? -tabSize : 0)), 
        cursor: 'grab',
        filter: highlight ? 'drop-shadow(0 0 10px rgba(46, 213, 115, 0.9))' : 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))',
        zIndex: highlight ? 1000 : 1 // Ensure highlighted blocks are visible
      }}
    >
      <path 
        d={path} 
        fill={block.color} 
        stroke="#2c3e50" 
        strokeWidth={Math.max(1, 2 * tabScale)}
        style={{ transition: 'fill 0.2s ease' }}
      />
      <text 
        x={size.w / 2} 
        y={size.h / 2}
        fill="white" 
        fontSize={layout.fontSize} 
        fontFamily='ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ 
          pointerEvents: 'none',
          fontWeight: '500',
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
        }}
      >
        {layout.lines.map((line, i) => (
          <tspan key={i} x={size.w / 2} dy={i === 0 ? -((layout.lines.length - 1) / 2) * layout.lineHeight : layout.lineHeight}>{line}</tspan>
        ))}
      </text>
    </svg>
  );
}

type RandomExtrasConfig = { count: number; pool: string[] }

const DEFAULT_RESULT_MESSAGE = 'Output updates automatically as you move blocks.';

// Python built-ins
const PYTHON_BUILTINS = new Set(['print', 'range', 'sum', 'len', 'int', 'float', 'bool', 'str', 'list', 'input', 'abs']);
const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
  'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'True', 'try', 'while', 'with', 'yield'
]);

// C# built-ins and keywords
const CSHARP_BUILTINS = new Set([
  'Console', 'System', 'Math', 'String', 'Object', 'Array', 'List', 'Dictionary',
  'int', 'string', 'double', 'bool', 'float', 'char', 'byte', 'short', 'long',
  'decimal', 'var', 'void', 'object', 'dynamic', 'DateTime', 'TimeSpan'
]);
const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
  'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do',
  'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally',
  'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int',
  'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null',
  'object', 'operator', 'out', 'override', 'params', 'private', 'protected',
  'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof',
  'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using',
  'virtual', 'void', 'volatile', 'while'
]);

// Get built-ins and keywords for a specific language
function getLanguageBuiltins(language: string): Set<string> {
  const lang = (language || 'python').toLowerCase();
  if (lang === 'csharp' || lang === 'c#') {
    return CSHARP_BUILTINS;
  }
  return PYTHON_BUILTINS;
}

function getLanguageKeywords(language: string): Set<string> {
  const lang = (language || 'python').toLowerCase();
  if (lang === 'csharp' || lang === 'c#') {
    return CSHARP_KEYWORDS;
  }
  return PYTHON_KEYWORDS;
}

const HINT_COSTS: Record<1 | 2 | 3, number> = {
  1: 100,
  2: 150,
  3: 200,
};

function removeStringLiterals(text: string) {
  return text.replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, ' ');
}

function extractIdentifiers(text: string, language: string = 'python'): string[] {
  const sanitized = removeStringLiterals(text);
  const matches = sanitized.match(/\b[a-zA-Z_][\w]*\b/g) || [];
  const keywords = getLanguageKeywords(language);
  const builtins = getLanguageBuiltins(language);
  return matches.filter(token => !keywords.has(token) && !builtins.has(token));
}

/**
 * Extract variable identifiers from code, excluding method names in method calls
 * This function properly handles cases like text.upper() where "upper" is a method, not a variable
 */
function extractVariableIdentifiers(line: string, language: string = 'python'): string[] {
  const sanitized = removeStringLiterals(line);
  const identifiers: string[] = [];
  
  // Remove all method calls and attribute access (pattern: identifier.methodName or identifier.attribute)
  // This regex matches: identifier.methodName(...) or identifier.attribute and replaces with just identifier
  // We do this iteratively to handle chained calls like text.upper().title()
  let processed = sanitized;
  let previousProcessed = '';
  
  // Keep removing method calls until no more changes (handles chained calls)
  while (processed !== previousProcessed) {
    previousProcessed = processed;
    // Remove method calls: identifier.methodName(...) -> identifier(...)
    processed = processed.replace(/\b([a-zA-Z_][\w]*)\.[a-zA-Z_][\w]*\s*\(/g, '$1(');
    // Remove attribute access: identifier.attribute -> identifier
    processed = processed.replace(/\b([a-zA-Z_][\w]*)\.[a-zA-Z_][\w]*\b/g, '$1');
  }
  
  // Now extract identifiers
  const matches = processed.match(/\b[a-zA-Z_][\w]*\b/g) || [];
  
  const keywords = getLanguageKeywords(language);
  const builtins = getLanguageBuiltins(language);
  
  for (const token of matches) {
    // Skip keywords and built-ins
    if (keywords.has(token) || builtins.has(token)) {
      continue;
    }
    identifiers.push(token);
  }
  
  return identifiers;
}

function detectProgramIssues(lines: string[], language: string = 'python'): string | null {
  if (!lines.length) return null;

  const defined = new Set<string>();
  const seenPrints = new Map<string, number>();
  const lang = (language || 'python').toLowerCase();
  const isCSharp = lang === 'csharp' || lang === 'c#';

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx] || '';
    const trimmed = rawLine.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;

    // Skip comment-only lines
    if (trimmed.startsWith('#')) continue;

    // Treat Python function definitions as introducing the function name
    if (!isCSharp && trimmed.startsWith('def ')) {
      const fnMatch = trimmed.match(/^def\s+([a-zA-Z_][\w]*)\s*\(/);
      if (fnMatch) {
        defined.add(fnMatch[1]);
        continue;
      }
    }

    // Check for duplicate print statements (Python) or Console.WriteLine (C#)
    if (isCSharp) {
      if (trimmed.includes('Console.WriteLine') || trimmed.includes('Console.Write')) {
        const normalizedPrint = trimmed.replace(/\s+/g, ' ');
        if (seenPrints.has(normalizedPrint)) {
          const firstIdx = seenPrints.get(normalizedPrint)!;
          return `Logic Error: duplicate print detected (blocks #${firstIdx + 1} and #${idx + 1}).`;
        }
        seenPrints.set(normalizedPrint, idx);
      }
    } else {
      if (trimmed.startsWith('print')) {
        const normalizedPrint = trimmed.replace(/\s+/g, ' ');
        if (seenPrints.has(normalizedPrint)) {
          const firstIdx = seenPrints.get(normalizedPrint)!;
          return `Logic Error: duplicate print detected (blocks #${firstIdx + 1} and #${idx + 1}).`;
        }
        seenPrints.set(normalizedPrint, idx);
      }
    }

    // Handle variable declarations and assignments
    // C#: "int age = 18;" or "var name = \"test\";"
    // Python: "age = 18"
    let assignmentMatch: RegExpMatchArray | null = null;
    let lhs = '';
    
    if (isCSharp) {
      // Match C# type declarations: "int x = ...", "string y = ...", "var z = ..."
      assignmentMatch = trimmed.match(/^(?:int|string|double|bool|float|char|byte|short|long|decimal|var)\s+([a-zA-Z_][\w]*)\s*=/);
      if (assignmentMatch) {
        lhs = assignmentMatch[1];
      } else {
        // Also check for simple assignments without type: "x = ..."
        assignmentMatch = trimmed.match(/^([a-zA-Z_][\w]*)\s*=/);
        if (assignmentMatch && !trimmed.startsWith('for ')) {
          lhs = assignmentMatch[1];
        }
      }
    } else {
      // Python: simple assignment
      assignmentMatch = trimmed.match(/^([a-zA-Z_][\w]*)\s*=/);
      if (assignmentMatch && !trimmed.startsWith('for ')) {
        lhs = assignmentMatch[1];
      }
    }

    if (assignmentMatch && lhs) {
      const rhs = trimmed.slice(trimmed.indexOf('=') + 1);
      // Use the improved function that excludes method names and built-ins
      const identifiers = extractVariableIdentifiers(rhs, language);
      for (const ident of identifiers) {
        if (!defined.has(ident)) {
          return `Logic Error: variable "${ident}" is used before it is defined (block #${idx + 1}).`;
        }
      }
      defined.add(lhs);
      continue;
    }

    // For non-assignment lines, extract variable identifiers (excluding method names and built-ins)
    const identifiers = extractVariableIdentifiers(trimmed, language);
    for (const ident of identifiers) {
      if (!defined.has(ident)) {
        return `Logic Error: variable "${ident}" is used before it is defined (block #${idx + 1}).`;
      }
    }
  }

  return null;
}

function normalizeLineText(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function stripConnectionsForBlock(source: Connections, blockId: number): Connections {
  const next: Connections = {};
  for (const [key, entry] of Object.entries(source)) {
    const id = Number(key);
    if (id === blockId) continue;
    const filtered: Partial<Record<Side, number>> = {};
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      const neighbor = entry?.[side];
      if (neighbor != null && neighbor !== blockId) {
        filtered[side] = neighbor;
      }
    }
    if (Object.keys(filtered).length) {
      next[id] = filtered;
    }
  }
  return next;
}

export default function JigsawCodePuzzle({
  height = 520,
  scale = 0.65,
  boardWidth = 900,
  rightPanelWidth = 420,
  onSubmitResult,
  onReset,
  initialTexts,
  randomExtras,
  language = 'python',
  currentLevel = 1,
  difficulty = 'Easy',
  hint,
  showHintButton = true,
  onHintRequest,
  hintLabel,
  isLastLevel = false,
  achievements
}: {
  height?: number;
  scale?: number;
  boardWidth?: number;
  rightPanelWidth?: number;
  onSubmitResult?: (status: 'success' | 'error', code?: string) => void;
  onReset?: () => void;
  initialTexts?: string[];
  randomExtras?: RandomExtrasConfig;
  language?: string;
  currentLevel?: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  hint?: string;
  showHintButton?: boolean;
  onHintRequest?: (level: 1 | 2 | 3, cost: number) => Promise<boolean> | boolean;
  hintLabel?: string;
  isLastLevel?: boolean;
  achievements?: Array<{ title: string; description: string; icon?: string; expReward?: number }>;
}) {
  const margin = 40
  const padding = 40  // Increased padding to prevent overlapping
  const maxAttempts = 150  // Increased attempts for better placement

  const calculateCanvasHeight = React.useCallback((placements: Placement[]) => {
    if (!placements.length) return height
    const bottom = placements.reduce((max, placement) => Math.max(max, placement.y + placement.layout.h), 0)
    return Math.max(height, bottom + margin)
  }, [height])

  const canonicalLines = React.useMemo(() => {
    // Only use initialTexts from props - never fall back to hardcoded blocks
    // This ensures database lessons are always used
    if (!initialTexts || initialTexts.length === 0) {
      console.warn('⚠️ No initialTexts provided to JigsawCodePuzzle - puzzle will be empty', {
        initialTexts,
        type: typeof initialTexts,
        isArray: Array.isArray(initialTexts),
        length: initialTexts?.length
      })
      return []
    }
    const normalise = (line: string) => line.replace(/\r/g, '').replace(/\s+$/g, '').replace(/\s+/g, ' ').trim()
    const filtered = initialTexts
      .filter(line => !!line && line.trim().length > 0)
      .map(line => normalise(line))
    
    if (filtered.length === 0 && initialTexts.length > 0) {
      console.warn('⚠️ All initialTexts were filtered out (empty/whitespace only):', {
        originalLength: initialTexts.length,
        originalPreview: initialTexts.slice(0, 3)
      })
    }
    
    return filtered
  }, [initialTexts])

  const canonicalNormalizedSet = React.useMemo(() => {
    const set = new Set<string>()
    for (const line of canonicalLines) {
      set.add(normalizeLineText(line))
    }
    return set
  }, [canonicalLines])

  const shouldConnectHorizontally = React.useCallback((currentText: string, nextText: string | null): boolean => {
    if (!nextText) return false
    const current = currentText.trim()
    const next = nextText.trim()
    if (!current || !next) return false
    const lang = (language || '').toLowerCase()

    const assignmentKeywords = /^(var|let|const|int|double|float|char|byte|short|long|string|bool|boolean)\s+\w+\s*$/i
    const functionLikePrefixes = [
      /^[a-zA-Z_][\w]*\s*$/,
      /^[a-zA-Z_][\w]*\.\w+\s*$/,
      /^console\.\w+\s*$/i,
      /^system\.\w+\s*$/i,
      /^fmt\.\w+\s*$/i,
      /^std::\w+\s*$/i,
      /^print\s*$/i,
      /^echo\s*$/i,
      /^cout\s*<<\s*$/i
    ]

    const nextStartsWith = (pattern: RegExp) => pattern.test(next)
    const currentEndsWith = (value: string) => current.endsWith(value)

    if (functionLikePrefixes.some(regex => regex.test(current)) && next.startsWith('(')) {
      return true
    }
    if (lang === 'python' && current.match(/^(print|len|range|sum|input|str|int|float)\s*$/i) && next.startsWith('(')) {
      return true
    }
    if ((lang === 'javascript' || lang === 'typescript') && current.startsWith('console.') && next.startsWith('(')) {
      return true
    }
    if (currentEndsWith('(') && nextStartsWith(/^["'`]/)) return true
    if (currentEndsWith('(') && nextStartsWith(/^[\w$]/)) return true
    if (assignmentKeywords.test(current) && next.startsWith('=')) return true
    if (current.match(/^[\w"']+\s*$/) && next.match(/^[+\-*/=<>!&|^]+\s*/)) return true
    if (current.match(/^[\w"')\]}]+\s*$/) && next === ';') return true
    if ((currentEndsWith('+') || currentEndsWith('-') || currentEndsWith('*') || currentEndsWith('/') || currentEndsWith('%') || currentEndsWith('<<') || currentEndsWith('>>')) && next.length > 0) {
      return true
    }
    if (currentEndsWith('=') && next.length > 0) return true
    return false
  }, [language])

  const buildBlocksFromTexts = React.useCallback((texts: string[]): { blocks: Block[]; canvasHeight: number } => {
    const extrasTarget = Math.max(0, randomExtras?.count ?? 0)
    const sanitizedBase = texts.filter(text => text && text.trim().length > 0)
    const configuredPool = (randomExtras?.pool && randomExtras.pool.length ? randomExtras.pool : defaultExtraPool)
      .filter(item => item && item.trim().length > 0 && !sanitizedBase.includes(item))
    const pool = sanitizedBase.slice()

    if (extrasTarget > 0) {
      const used = new Set(pool)
      let added = 0
      let attempts = 0
      const extraAttempts = Math.max(32, extrasTarget * Math.max(configuredPool.length, 1) * 4)
      while (added < extrasTarget && attempts < extraAttempts) {
        attempts += 1
        const candidateSource = configuredPool.length ? configuredPool : defaultExtraPool
        const candidate = candidateSource[Math.floor(Math.random() * candidateSource.length)]
        if (!candidate || used.has(candidate) || candidate.trim().length === 0) continue
        pool.push(candidate)
        used.add(candidate)
        added += 1
      }
      while (added < extrasTarget) {
        const filler = `extra_block_${added + 1} = None`
        if (!used.has(filler)) {
          pool.push(filler)
          used.add(filler)
          added += 1
        } else {
          break
        }
      }
    }

    const uniquePool = pool.filter(text => text && text.trim().length > 0)
    const palette = generateColorPalette(uniquePool, uniquePool.length)

    const layoutInfos = uniquePool.map((text, idx) => ({
      id: idx + 1,
      text,
      color: (palette[idx % palette.length]) || fallbackPalette[idx % fallbackPalette.length],
      layout: computeBlockLayout(text, scale)
    }))

    if (!layoutInfos.length) {
      return { blocks: [], canvasHeight: height }
    }

    const rectanglesOverlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => {
      return !(
        ax + aw + padding <= bx ||
        ax >= bx + bw + padding ||
        ay + ah + padding <= by ||
        ay >= by + bh + padding
      )
    }

    const mulberry32 = (seed: number) => () => {
      let t = (seed += 0x6d2b79f5)
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    // Use a time-based seed and shuffled order so each level load feels random,
    // not fixed to the same positions every time.
        const tryRandomPlacement = (): Placement[] | null => {
          const placements: Placement[] = []
      const randomSeed = Math.floor(Math.random() * 0x7fffffff) + Date.now()
      const shuffled = [...layoutInfos].sort(() => Math.random() - 0.5)

      for (let idx = 0; idx < shuffled.length; idx++) {
        const info = shuffled[idx]
        const blockRandomOffset = Math.floor(Math.random() * 1000000)
        const rand = mulberry32(randomSeed + idx * 997 + info.text.length * 31 + blockRandomOffset)
            const spanW = Math.max(0, boardWidth - margin * 2 - info.layout.w)
            const spanH = Math.max(0, height - margin * 2 - info.layout.h)
            let placedSuccessfully = false

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              const candidateX = Math.round(margin + rand() * spanW)
              const candidateY = Math.round(margin + rand() * spanH)
              const maxX = boardWidth - margin - info.layout.w
              const constrainedX = Math.max(margin, Math.min(maxX, candidateX))
          const overlaps = placements.some(existing =>
            rectanglesOverlap(
              constrainedX,
              candidateY,
              info.layout.w,
              info.layout.h,
              existing.x,
              existing.y,
              existing.layout.w,
              existing.layout.h
            )
          )
              if (!overlaps) {
                placements.push({ id: info.id, text: info.text, color: info.color, x: constrainedX, y: candidateY, layout: info.layout })
                placedSuccessfully = true
                break
              }
            }

            if (!placedSuccessfully) {
              return null
            }
          }

          return placements
        }

    const randomPlacements = tryRandomPlacement()
    if (randomPlacements) {
      return {
        blocks: randomPlacements.map(({ layout, ...rest }) => rest),
        canvasHeight: calculateCanvasHeight(randomPlacements)
      }
    }

    const buildFallbackPlacements = (): Placement[] => {
      const maxWidth = layoutInfos.reduce((max, info) => Math.max(max, info.layout.w), 0)
      const maxHeight = layoutInfos.reduce((max, info) => Math.max(max, info.layout.h), 0)

      if (!maxWidth || !maxHeight) {
        return layoutInfos.map(info => ({ id: info.id, text: info.text, color: info.color, x: margin, y: margin, layout: info.layout }))
      }

      let columns = Math.max(1, Math.floor((boardWidth - margin * 2 + padding) / (maxWidth + padding)))
      columns = Math.max(1, Math.min(columns, layoutInfos.length))

      if (columns > 1) {
        const maxSpan = boardWidth - margin * 2 - maxWidth
        if (maxSpan <= 0) {
          columns = 1
        } else {
          while (columns > 1) {
            const step = maxSpan / (columns - 1)
            if (step >= maxWidth + padding) break  // Use padding instead of hardcoded 8
            columns -= 1
          }
        }
      }

      const maxSpan = boardWidth - margin * 2 - maxWidth
      const step = columns > 1 ? maxSpan / Math.max(1, columns - 1) : 0
      const columnStep = columns > 1 ? Math.max(maxWidth + padding, Math.min(maxWidth + padding * 1.5, step)) : 0
      const rowStep = maxHeight + padding

      const placements: Placement[] = []
      layoutInfos.forEach((info, idx) => {
        const col = columns > 0 ? idx % columns : 0
        const row = columns > 0 ? Math.floor(idx / columns) : idx
        let x = Math.round(margin + col * columnStep)
        const y = Math.round(margin + row * rowStep)
        // Ensure block doesn't extend beyond boardWidth
        const maxX = boardWidth - margin - info.layout.w
        x = Math.max(margin, Math.min(maxX, x))
        placements.push({ id: info.id, text: info.text, color: info.color, x, y, layout: info.layout })
      })
      return placements
    }

    const fallbackPlacements = buildFallbackPlacements()
    return {
      blocks: fallbackPlacements.map(({ layout, ...rest }) => rest),
      canvasHeight: calculateCanvasHeight(fallbackPlacements)
    }
  }, [boardWidth, calculateCanvasHeight, height, randomExtras, scale])

  // Don't use initialPlacement for state initialization - let the useEffect handle it
  // This ensures patterns are always set up correctly
  const [blocks, setBlocks] = useState<Block[]>([])
  const [canvasHeight, setCanvasHeight] = useState<number>(height)
  const [patternsById, setPatternsById] = useState<Record<number, PatternSides>>(() => {
    // Default patterns for legacy Two Sum demo
    const p: Record<number, PatternSides> = {
      1: { top: false, right: true, bottom: true, left: false },
      2: { top: true, right: false, bottom: true, left: true },
      3: { top: true, right: true, bottom: false, left: false },
      4: { top: false, right: true, bottom: false, left: true },
      5: { top: true, right: false, bottom: true, left: false },
    }
    return p
  });
  const [connections, setConnections] = useState<Connections>({});
  const [snapPreview, setSnapPreview] = useState<{ movingId: number; targetId: number; side: Side; dx: number; dy: number } | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());
  const [outputText, setOutputText] = useState<string>('// Program output will appear here...');
  const [resultStatus, setResultStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [resultDetails, setResultDetails] = useState<string>(DEFAULT_RESULT_MESSAGE);
  const [expectedOutput, setExpectedOutput] = useState<string>('');
  const [actualOutput, setActualOutput] = useState<string>('');
  const [livePreviewOutput, setLivePreviewOutput] = useState<string>('');
  const [showCongratulations, setShowCongratulations] = useState(false);
  const [isOutputMinimized, setIsOutputMinimized] = useState(false);
  const [achievementNotifications, setAchievementNotifications] = useState<Array<{ id: string; title: string; description: string; icon: string; expReward?: number }>>([]);
  
  // Show achievement notifications when achievements are passed in
  React.useEffect(() => {
    if (achievements && achievements.length > 0) {
      achievements.forEach((achievement, index) => {
        setTimeout(() => {
          const notificationId = `achievement-${Date.now()}-${index}`;
          setAchievementNotifications(prev => {
            // Avoid duplicates
            if (prev.some(n => n.title === achievement.title)) return prev;
            return [...prev, {
              id: notificationId,
              title: achievement.title,
              description: achievement.description,
              icon: achievement.icon || '🏆',
              expReward: achievement.expReward
            }];
          });
          
          // Auto-remove after 5 seconds
          setTimeout(() => {
            setAchievementNotifications(prev => prev.filter(n => n.id !== notificationId));
          }, 5000);
        }, 300 + (index * 400)); // Stagger notifications
      });
    }
  }, [achievements]);
  
  const [hintMessages, setHintMessages] = useState<{ id: string; title: string; body: string }[]>([]);
  const [hintUsage, setHintUsage] = useState<{ basic: boolean; syntax: boolean; autoFix: boolean }>({
    basic: false,
    syntax: false,
    autoFix: false
  });
  const displayedProgramOutput = actualOutput || expectedOutput || livePreviewOutput;
  const dragState = useRef<{ id: number | null; offsetX: number; offsetY: number } | null>(null);
  const dragGroupRef = useRef<{ primaryId: number; ids: number[]; relativeOffsets: Record<number, { dx: number; dy: number }>, singleDrag: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const SNAP_THRESHOLD = 12;
  const BREAK_THRESHOLD = 8; // Reduced threshold for easier separation
  const audioCtxRef = useRef<any>(null);

  const hasAnyConnection = React.useCallback((id: number) => {
    const entry = connections[id];
    if (!entry) return false;
    return (['top', 'bottom', 'left', 'right'] as Side[]).some(side => entry[side] != null);
  }, [connections]);

  const getConnectedComponents = React.useCallback(() => {
    const seen = new Set<number>();
    const components: number[][] = [];
    for (const block of blocks) {
      if (seen.has(block.id)) continue;
      const queue = [block.id];
      const component: number[] = [];
      while (queue.length) {
        const current = queue.shift()!;
        if (seen.has(current)) continue;
        seen.add(current);
        component.push(current);
        const neighbors = Object.values(connections[current] || {})
          .filter((value): value is number => typeof value === 'number');
        for (const neighbor of neighbors) {
          if (!seen.has(neighbor)) queue.push(neighbor);
        }
      }
      components.push(component);
    }
    return components;
  }, [blocks, connections]);

  const normalizeProgramString = React.useCallback((program: string): string[] => {
    const normalise = (line: string) => line.replace(/\s+/g, ' ').trim()
    return program
      .replace(/\r/g, '')
      .split('\n')
      .map(normalise)
      .filter(line => line.length > 0);
  }, []);

  // React to lesson change (initialTexts prop)
  // Use a ref to track the last initialTexts to prevent unnecessary resets
  const lastInitialTextsRef = React.useRef<string[]>([])
  const lastLanguageRef = React.useRef<string>(language)
  const lastLevelRef = React.useRef<number>(currentLevel)
  const lastDifficultyRef = React.useRef<string>(difficulty)
  const hasInitializedRef = React.useRef<boolean>(false)
  const isResettingRef = React.useRef<boolean>(false)
  
  React.useEffect(() => {
    // Skip initialization if we're in the middle of a reset
    if (isResettingRef.current) {
      return
    }
    
    // Only reset if initialTexts actually changed (deep comparison) OR language/level/difficulty changed
    const currentTextsLength = initialTexts?.length || 0
    const lastTextsLength = lastInitialTextsRef.current.length
    
    const textsChanged = 
      currentTextsLength !== lastTextsLength ||
      (initialTexts && initialTexts.some((text, idx) => text !== lastInitialTextsRef.current[idx]))
    
    const languageChanged = lastLanguageRef.current !== language
    const levelChanged = lastLevelRef.current !== currentLevel
    const difficultyChanged = lastDifficultyRef.current !== difficulty
    
    // Important: Also reset if initialTexts goes from empty to having content (or vice versa)
    const wentFromEmptyToPopulated = lastTextsLength === 0 && currentTextsLength > 0
    const wentFromPopulatedToEmpty = lastTextsLength > 0 && currentTextsLength === 0
    
    // CRITICAL: Always initialize on first render if we have texts, even if refs are empty
    // This ensures patterns are set up correctly on initial load
    const needsInitialization = !hasInitializedRef.current && currentTextsLength > 0
    // Use refs to check state instead of reading directly to avoid stale closures
    // We'll check blocks/patterns state only when we know we need to initialize
    // IMPORTANT: When component remounts, blocks state is reset to [], so we need to check current state
    const hasTextsButNoBlocks = currentTextsLength > 0 && blocks.length === 0
    const hasBlocksButNoPatterns = blocks.length > 0 && Object.keys(patternsById).length === 0
    
    // Always initialize if we have texts but no blocks/patterns, OR if something changed
    // Also initialize if we went from empty to populated (handles remount case where initialTexts loads after mount)
    // Additional safety: if we have texts but haven't initialized yet, always initialize
    // This handles the case where component remounts and initialTexts is available immediately
    // CRITICAL: If we have texts and no blocks, we MUST initialize (handles remount after level change)
    const shouldInitialize = (initialTexts && initialTexts.length > 0 && 
      (hasTextsButNoBlocks || hasBlocksButNoPatterns || needsInitialization || 
       textsChanged || languageChanged || levelChanged || difficultyChanged || 
       wentFromEmptyToPopulated))
    
    // Force initialization if we have texts but haven't initialized - this is critical for remounts
    // Also force if we have texts but blocks are empty (handles case where component initialized with empty blocks)
    // This ensures that if initialTexts becomes available after being empty, we always initialize
    const mustInitialize = currentTextsLength > 0 && (!hasInitializedRef.current || blocks.length === 0)
    
    // Debug log to help diagnose initialization issues
    if (currentTextsLength > 0 && blocks.length === 0) {
      console.log('🔧 Must initialize: have texts but no blocks', {
        currentTextsLength,
        hasInitialized: hasInitializedRef.current,
        blocksLength: blocks.length,
        mustInitialize
      })
    }
    
    if (shouldInitialize || mustInitialize) {
      console.log('🔄 JigsawCodePuzzle: Resetting blocks due to change:', {
        textsChanged,
        languageChanged,
        levelChanged,
        difficultyChanged,
        wentFromEmptyToPopulated,
        needsInitialization,
        hasBlocksButNoPatterns,
        currentTextsLength,
        lastTextsLength,
        hasInitialized: hasInitializedRef.current,
        blocksCount: blocks.length,
        patternsCount: Object.keys(patternsById).length
      })
      
      lastInitialTextsRef.current = [...initialTexts]
      lastLanguageRef.current = language
      lastLevelRef.current = currentLevel
      lastDifficultyRef.current = difficulty
      hasInitializedRef.current = true
      const { blocks: newBlocks, canvasHeight: newHeight } = buildBlocksFromTexts(initialTexts)
      setBlocks(newBlocks)
      setCanvasHeight(newHeight)

      const p: Record<number, PatternSides> = {}
      const baseCount = initialTexts.length
      
      // Difficulty-based shape probabilities
      // Easy: fewer C-shapes (right tabs), simpler patterns
      // Medium: moderate C-shapes
      // Hard: more C-shapes for complex nested patterns
      const difficultyConfig = {
        Easy: { rightTabProb: 0.3, leftTabProb: 0.3 }, // 30% chance of C-shape
        Medium: { rightTabProb: 0.5, leftTabProb: 0.4 }, // 50% chance of C-shape
        Hard: { rightTabProb: 0.7, leftTabProb: 0.5 } // 70% chance of C-shape
      }
      const config = difficultyConfig[difficulty] || difficultyConfig.Easy
      const langForPatterns = (language || 'python').toLowerCase()
      const effectiveConfig = langForPatterns === 'python'
        ? { rightTabProb: 0, leftTabProb: 0 }
        : config
      
      // Use level number and difficulty to seed randomness for consistent but varied patterns per level
      const levelSeed = currentLevel * 1000 + (difficulty === 'Easy' ? 1 : difficulty === 'Medium' ? 2 : 3)
      const rand = (seedA: number, seedB: number) => {
        let x = Math.imul(seedA ^ 0x9e3779b1, 0x85ebca6b) ^ (seedB + levelSeed)
        x ^= x >>> 15; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2f); x ^= x >>> 16
        return (x >>> 0) / 0xffffffff
      }
      
      // Check if a block should connect to the previous one (for semicolons, etc.)
      const shouldConnectToPrevious = (currentText: string, prevText: string | null): boolean => {
        if (!prevText) return false
        
        const current = currentText.trim()
        const prev = prevText.trim()
        
        // Semicolon should connect to previous statement
        if (current === ';' && prev.length > 0 && !prev.endsWith(';')) return true
        
        // Opening parenthesis should connect to function/method name
        if (current.startsWith('(') && prev.match(/^[a-zA-Z_][\w]*\.?\w*\s*$/)) return true
        
        // String literals should connect to opening parenthesis
        if ((current.startsWith('"') || current.startsWith("'") || current.startsWith('$"')) && prev.endsWith('(')) return true
        
        return false
      }
      
      // First pass: determine which blocks should connect horizontally
      const horizontalConnections: Record<number, { right?: boolean; left?: boolean }> = {}
      for (let i = 0; i < baseCount; i++) {
        const id = i + 1
        const currentText = initialTexts[i]
        const nextText = i < baseCount - 1 ? initialTexts[i + 1] : null
        const prevText = i > 0 ? initialTexts[i - 1] : null
        
        horizontalConnections[id] = {}
        
        if (shouldConnectHorizontally(currentText, nextText)) {
          horizontalConnections[id].right = true
        }
        if (shouldConnectToPrevious(currentText, prevText)) {
          horizontalConnections[id].left = true
          // Mark previous block should have right tab
          if (i > 0) {
            const prevId = i
            horizontalConnections[prevId] = horizontalConnections[prevId] || {}
            horizontalConnections[prevId].right = true
          }
        }
      }
      
      // Second pass: assign shapes based on connections
      for (let i = 0; i < newBlocks.length; i++) {
        const id = i + 1
        if (i < baseCount) {
          const topShape: any = i === 0 ? 'flat' : 'slot'
          const bottomShape: any = i === baseCount - 1 ? 'flat' : 'tab'
          
          const connections = horizontalConnections[id] || {}
          
          // Assign horizontal shapes based on connections
          const rightShape: any = connections.right
            ? 'tab'
            : ((rand(id, 29) < effectiveConfig.rightTabProb) ? 'tab' : 'slot')
          const leftShape: any = connections.left
            ? 'slot'
            : ((rand(id, 17) < effectiveConfig.leftTabProb) ? 'tab' : 'slot')
          
          // Ensure compatibility: if previous block has right tab, this should have left slot
          let finalLeftShape = leftShape
          if (i > 0) {
            const prevId = i
            const prevConnections = horizontalConnections[prevId] || {}
            if (prevConnections.right) {
              // Previous has right tab, this needs left slot
              finalLeftShape = 'slot'
            }
          }
          
          p[id] = { top: topShape, right: rightShape, bottom: bottomShape, left: finalLeftShape }
        } else {
          p[id] = { top: false, right: false, bottom: false, left: false }
        }
      }
      setPatternsById(p)
      setConnections({})
      setSnapPreview(null)
      setHighlightIds(new Set())
      setOutputText('// Program output will appear here...')
      setResultStatus('pending')
      setActualOutput('')
      setIsOutputMinimized(false)
      setHintMessages([])
      setHintUsage({ basic: false, syntax: false, autoFix: false })
    } else {
      // No initialTexts provided
      // CRITICAL: Never clear blocks if we already have blocks - this prevents clearing during level transitions
      // Only clear if we've never had blocks (true error case)
      if (hasInitializedRef.current && blocks.length > 0) {
        // We have blocks but initialTexts is empty - this is likely a transition state
        // Keep the existing blocks until new initialTexts becomes available
        console.log('⏳ initialTexts temporarily empty but blocks exist - keeping blocks during transition...', {
          hasInitialized: hasInitializedRef.current,
          currentTextsLength: currentTextsLength,
          lastTextsLength: lastTextsLength,
          blocksLength: blocks.length,
          level: currentLevel,
          language
        })
        // Update refs but don't clear blocks - wait for initialTexts to become available
        lastInitialTextsRef.current = []
        // Don't clear blocks - they'll be replaced when initialTexts becomes available
        return // Exit early, don't clear anything
      } else if (hasInitializedRef.current && blocks.length === 0) {
        // We've initialized but have no blocks - this is a real error
        console.warn('⚠️ No initialTexts provided after initialization - puzzle will be empty. Check that database lesson has initialCode.')
        setBlocks([])
        setCanvasHeight(height)
        setPatternsById({})
        setConnections({})
        setSnapPreview(null)
        setHighlightIds(new Set())
        setOutputText('// Program output will appear here...')
        setResultStatus('pending')
        setActualOutput('')
        setIsOutputMinimized(false)
        setHintMessages([])
        setHintUsage({ basic: false, syntax: false, autoFix: false })
      } else {
        // Haven't initialized yet - initialTexts might be loading
        // Don't set empty blocks, just wait for initialTexts to become available
        console.log('⏳ Waiting for initialTexts to become available...', {
          hasInitialized: hasInitializedRef.current,
          currentTextsLength: currentTextsLength,
          lastTextsLength: lastTextsLength,
          blocksLength: blocks.length
        })
        // Update refs to track current state, even though we're not initializing
        // This ensures we can detect when initialTexts becomes available
        lastInitialTextsRef.current = []
        // Reset the initialization flag so we can initialize when texts become available
        if (hasInitializedRef.current && blocks.length === 0) {
          hasInitializedRef.current = false
        }
      }
    }
  }, [initialTexts, buildBlocksFromTexts, calculateCanvasHeight, scale, difficulty, currentLevel, language])

  const playSnap = useCallback(() => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.15);
    } catch {}
  }, []);

  const playLevelCompleteSound = useCallback(() => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      
      // Resume audio context if suspended (required by browser autoplay policies)
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      
      const now = ctx.currentTime;
      
      // Create a triumphant fanfare with multiple notes
      // Major chord progression: C-E-G-C (C major chord)
      const notes = [
        { freq: 523.25, time: 0, duration: 0.3 },    // C5
        { freq: 659.25, time: 0.1, duration: 0.3 },  // E5
        { freq: 783.99, time: 0.2, duration: 0.3 },   // G5
        { freq: 1046.50, time: 0.3, duration: 0.5 }  // C6 (high note)
      ];
      
      notes.forEach((note, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        // Use different waveforms for richer sound
        osc.type = index === notes.length - 1 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.time);
        
        // Create a pleasant envelope
        gain.gain.setValueAtTime(0, now + note.time);
        gain.gain.linearRampToValueAtTime(0.15, now + note.time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now + note.time);
        osc.stop(now + note.time + note.duration);
      });
      
      // Add a subtle bass note for depth
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(261.63, now); // C4 (one octave lower)
      bassGain.gain.setValueAtTime(0, now);
      bassGain.gain.linearRampToValueAtTime(0.1, now + 0.1);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      bassOsc.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 0.6);
      
    } catch (err) {
      // Silently fail if audio is not available
      console.debug('Audio playback failed:', err);
    }
  }, []);

  // Play sound when congratulations popup appears
  React.useEffect(() => {
    if (showCongratulations) {
      // Small delay to ensure popup is visible
      const soundTimeout = setTimeout(() => {
        playLevelCompleteSound();
      }, 100);
      return () => clearTimeout(soundTimeout);
    }
  }, [showCongratulations, playLevelCompleteSound]);

  const getSockets = useCallback((b: Block) => {
    const size = computeBlockLayout(b.text, scale);
    const x = b.x; const y = b.y; const w = size.w; const h = size.h;
    return {
      top: { x: x + w / 2, y: y },
      bottom: { x: x + w / 2, y: y + h },
      left: { x: x, y: y + h / 2 },
      right: { x: x + w, y: y + h / 2 },
    };
  }, [scale]);

  const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  const requestHintPermission = React.useCallback(async (level: 1 | 2 | 3) => {
    if (!onHintRequest) return true;
    const cost = HINT_COSTS[level];
    try {
      const allowed = await onHintRequest(level, cost);
      return allowed !== false;
    } catch {
      return false;
    }
  }, [onHintRequest]);

  function buildDragGroup(startId: number) {
    // BFS over connections to gather connected blocks
    const visited = new Set<number>();
    const queue = [startId];
    visited.add(startId);
    while (queue.length) {
      const id = queue.shift()!;
      const con = connections[id] || {};
      for (const side of ['top','bottom','left','right'] as Side[]) {
        const next = con[side];
        if (next != null && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return Array.from(visited);
  }

  function findBestSnap(movingId: number, newBlocks: Block[]): { targetId: number; side: Side; dx: number; dy: number } | null {
    const moving = newBlocks.find(b => b.id === movingId)!;
    const movingSockets = getSockets(moving);
    let best: { targetId: number; side: Side; dx: number; dy: number; dist: number } | null = null;
    for (const other of newBlocks) {
      if (other.id === movingId) continue;
      const otherSockets = getSockets(other);
      for (const side of ['top','bottom','left','right'] as Side[]) {
        const opp = opposite[side];
        const a = (movingSockets as any)[side];
        const b = (otherSockets as any)[opp];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= SNAP_THRESHOLD) {
          if (!best || dist < best.dist) {
            best = { targetId: other.id, side, dx, dy, dist };
          }
        }
      }
    }
    if (!best) return null;
    return { targetId: best.targetId, side: best.side, dx: best.dx, dy: best.dy };
  }

  function animateMove(updates: { id: number; toX: number; toY: number }[], duration = 140) {
    // Simple ease-out animation
    const start = performance.now();
    const fromBlocks = blocks.reduce<Record<number, { x: number; y: number }>>((acc, b) => { acc[b.id] = { x: b.x, y: b.y }; return acc; }, {});
    function frame(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      setBlocks(prev => prev.map(b => {
        const upd = updates.find(u => u.id === b.id);
        if (!upd) return b;
        const from = fromBlocks[b.id];
        return { ...b, x: from.x + (upd.toX - from.x) * ease, y: from.y + (upd.toY - from.y) * ease };
      }));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const onPointerDown = useCallback((id: number, e: React.PointerEvent) => {
    const target = e.currentTarget as SVGElement;
    const rect = target.getBoundingClientRect();
    dragState.current = { id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    
    // Reset status to pending when student starts a new attempt after an error
    if (resultStatus === 'error') {
      setResultStatus('pending');
      setActualOutput('');
    }
    
    // Always drag blocks independently - each block is independent even when connected
    const groupIds = [id]; // Always single block drag
    const rel: Record<number, { dx: number; dy: number }> = {};
    const primary = blocks.find(b => b.id === id)!;
    for (const gid of groupIds) {
      const b = blocks.find(bb => bb.id === gid)!;
      rel[gid] = { dx: b.x - primary.x, dy: b.y - primary.y };
    }
    dragGroupRef.current = { primaryId: id, ids: groupIds, relativeOffsets: rel, singleDrag: true };
    setHighlightIds(new Set(groupIds));
  }, [blocks, resultStatus]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current || dragState.current.id == null) return;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const baseX = e.clientX - (containerRect?.left || 0) - dragState.current.offsetX;
    const baseY = e.clientY - (containerRect?.top || 0) - dragState.current.offsetY;
    const primaryId = dragState.current.id;
    const group = dragGroupRef.current;
    if (!group) return;

    // Helper function to constrain block position within board boundaries
    const constrainPosition = (block: Block, x: number, y: number): { x: number; y: number } => {
      const blockLayout = computeBlockLayout(block.text, scale)
      const tabSize = 14 * scale // Account for jigsaw tabs
      const padding = 20 // Extra padding to keep blocks visible
      
      const minX = padding
      const maxX = Math.max(padding, boardWidth - blockLayout.w - padding - tabSize)
      const minY = padding
      const maxY = Math.max(padding, canvasHeight - blockLayout.h - padding - tabSize)
      
      return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y))
      }
    }

    // Move only the primary block (always independent drag)
    const nextBlocks = blocks.map(b => {
      if (b.id === primaryId) {
        const constrained = constrainPosition(b, baseX, baseY)
        return { ...b, x: constrained.x, y: constrained.y }
      }
      return b; // Other blocks stay in place
    });

    // Always check for connection breaking when dragging - blocks separate easily
    const cons = connections[primaryId] || {};
    let changed = false;
    const updated = { ...connections } as Connections;
    for (const side of ['top','bottom','left','right'] as Side[]) {
      const neighborId = cons[side];
      if (neighborId == null) continue;
      const primaryAfter = nextBlocks.find(b => b.id === primaryId)!;
      const neighborAfter = nextBlocks.find(b => b.id === neighborId) || blocks.find(b => b.id === neighborId)!;
      const a = (getSockets(primaryAfter) as any)[side];
      const b = (getSockets(neighborAfter) as any)[opposite[side]];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > BREAK_THRESHOLD) {
        // Break the connection on both sides - easy separation
        const selfCon = { ...(updated[primaryId] || {}) } as Partial<Record<Side, number>>;
        const neighCon = { ...(updated[neighborId] || {}) } as Partial<Record<Side, number>>;
        delete selfCon[side];
        delete neighCon[opposite[side]];
        updated[primaryId] = selfCon;
        updated[neighborId] = neighCon;
        changed = true;
      }
    }
    if (changed) setConnections(updated);

    // Snap preview using primary block
    const preview = findBestSnap(primaryId, nextBlocks);
    if (preview) {
      // Apply preview offset to the single block being dragged
      const withSnap = nextBlocks.map(b => {
        if (b.id === primaryId) {
          return { ...b, x: b.x + preview.dx, y: b.y + preview.dy };
        }
        return b;
      });
      setBlocks(withSnap);
      setSnapPreview({ ...preview, movingId: primaryId });
      setHighlightIds(new Set([primaryId, preview.targetId]));
    } else {
      setBlocks(nextBlocks);
      setSnapPreview(null);
      setHighlightIds(new Set([primaryId]));
    }
  }, [blocks, connections, scale, boardWidth, canvasHeight, margin, getSockets, opposite]);

  const onPointerUp = useCallback(() => {
    if (!dragState.current) return;
    const movingId = dragState.current.id;
    dragState.current.id = null;

    if (movingId != null && snapPreview) {
      // Finalize connection and animate slight settle - blocks lock when connected
      const { targetId, side } = snapPreview;
      const primary = blocks.find(b => b.id === movingId)!;
      const target = blocks.find(b => b.id === targetId)!;
      // Align exactly based on socket centers
      const primarySockets = getSockets(primary);
      const targetSockets = getSockets(target);
      const a = (primarySockets as any)[side];
      const b = (targetSockets as any)[opposite[side]];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // Only animate the single block being moved
      const blk = blocks.find(bb => bb.id === movingId)!;
      animateMove([{ id: movingId, toX: blk.x + dx, toY: blk.y + dy }], 160);
      setConnections(prev => {
        const copy: Connections = { ...prev };
        copy[movingId] = { ...(copy[movingId] || {}), [side]: targetId };
        copy[targetId] = { ...(copy[targetId] || {}), [opposite[side]]: movingId };
        return copy;
      });
      playSnap();
    }

    setSnapPreview(null);
    dragGroupRef.current = null;
    setHighlightIds(new Set());
  }, [blocks, snapPreview, getSockets, opposite]);

  const boardStyle: React.CSSProperties = {
    width: boardWidth,
    height: canvasHeight,
    background: 'var(--bg-puzzle-board, rgba(255,255,255,0.04))',
    border: '2px dashed var(--bg-puzzle-board-border, rgba(255,255,255,0.12))',
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden', // Clip blocks that go outside container
    minHeight: canvasHeight
  };

  const rightPanelStyle: React.CSSProperties = {
    width: rightPanelWidth,
    height: canvasHeight,
    border: '2px dashed var(--bg-puzzle-board-border, rgba(255,255,255,0.18))',
    borderRadius: 12,
    background: 'var(--bg-puzzle-board, rgba(255,255,255,0.03))',
    marginLeft: 16,
    padding: '16px 16px 20px 16px', // Extra bottom padding to prevent content cutoff
    boxSizing: 'border-box',
    color: 'var(--text-output, #e5e7eb)',
    overflowY: 'auto', // Allow scrolling if content exceeds height
    overflowX: 'hidden' // Prevent horizontal scroll
  };

  // Build connected vertical chains into text lines (using bottom links)
  function buildConnectedLines(): string[] {
    const idToBlock = new Map(blocks.map(b => [b.id, b] as const));
    const lines: string[] = [];
    const connectedComponents = getConnectedComponents()
      .filter(component => component.some(id => hasAnyConnection(id)));
    if (!connectedComponents.length) return lines;
    for (const component of connectedComponents) {
      const ordered = component
        .map(id => idToBlock.get(id)!)
        .filter(Boolean)
        .sort((a, b) => a.y - b.y);
      ordered.forEach(block => lines.push(block.text));
        lines.push('');
    }
    return lines;
  }

  function runProgram() {
    try {
      let program = buildConnectedLines().join('\n').trim();
      if (!program) {
        // Fallback to visual top-to-bottom if nothing is snapped
        program = [...blocks]
          .sort((a, b) => a.y - b.y)
          .map(b => b.text)
          .join('\n');
      }
      const stamped = `[Run @ ${new Date().toLocaleTimeString()}]` + (program ? `\n\n${program}` : '\n\n// Program output will appear here...');
      setOutputText(stamped);
      // Don't change resultStatus here - only on submit
      // Scroll output to top for visibility
      outputRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setOutputText(String(e));
      setResultStatus('error');
    }
  }

  // Compute a textual representation that mirrors the visual layout:
  // Handle both vertical (top/bottom) and horizontal (left/right) connections
  // Helper function to compute program text with block ID tracking
  function computeProgramTextWithBlockIds(): { text: string; lineToBlockIds: Map<number, number[]> } {
    if (!blocks.length) return { text: '', lineToBlockIds: new Map() };

    const connectedComponents = getConnectedComponents()
      .filter(component => component.some(id => hasAnyConnection(id)));

    const targetComponents = connectedComponents.length ? connectedComponents : [blocks.map(b => b.id)];

    const lines: string[] = [];
    const lineToBlockIds = new Map<number, number[]>();
    const idToBlock = new Map(blocks.map(b => [b.id, b] as const));
    let lineIndex = 0;

    for (const component of targetComponents) {
      const idSet = new Set(component);
      const componentBlocks = blocks.filter(b => idSet.has(b.id));
      if (!componentBlocks.length) continue;

      // Find starting blocks (no top or left connection)
      const findStartBlocks = (): number[] => {
        const starts: number[] = [];
        for (const block of componentBlocks) {
          const conn = connections[block.id] || {};
          if (!conn.top && !conn.left) {
            starts.push(block.id);
          }
        }
        if (starts.length === 0) {
          // Fallback: topmost, leftmost block
          const sorted = [...componentBlocks].sort((a, b) => {
            if (Math.abs(a.y - b.y) < 20) return a.x - b.x;
            return a.y - b.y;
          });
          if (sorted[0]) starts.push(sorted[0].id);
        }
        return starts;
      };

      const startIds = findStartBlocks();
      if (startIds.length === 0) continue;

      // Build lines by following connections
      // Strategy: Process top-to-bottom, left-to-right
      const visited = new Set<number>();
      const lineGroups: number[][] = [];

      const buildHorizontalChain = (startId: number): number[] => {
        const chain: number[] = [];
        let currentId: number | null = startId;

        // Follow left connections to find the start of the chain
        while (currentId != null) {
          const conn = connections[currentId] || {};
          if (conn.left && !visited.has(conn.left)) {
            currentId = conn.left;
          } else {
          break;
        }
      }

        // Now build the chain from left to right
        while (currentId != null && !visited.has(currentId)) {
          visited.add(currentId);
          chain.push(currentId);

          const conn = connections[currentId] || {};
          if (conn.right && !visited.has(conn.right)) {
            currentId = conn.right;
          } else {
            currentId = null;
          }
        }

        return chain;
      };

      // Process all lines starting from top
      const queue: number[] = [];
      
      // Find all top-level blocks (no top connection)
      for (const block of componentBlocks) {
        const conn = connections[block.id] || {};
        if (!conn.top) {
          queue.push(block.id);
        }
      }

      // If no top-level blocks found, start with first block
      if (queue.length === 0 && componentBlocks.length > 0) {
        queue.push(componentBlocks[0].id);
      }

      // Sort queue by position (top to bottom, then left to right) to ensure correct order
      queue.sort((idA, idB) => {
        const blockA = idToBlock.get(idA);
        const blockB = idToBlock.get(idB);
        if (!blockA || !blockB) return 0;
        // First sort by Y (top to bottom)
        const yDiff = blockA.y - blockB.y;
        if (Math.abs(yDiff) > 10) return yDiff; // Significant vertical difference
        // If roughly same Y, sort by X (left to right)
        return blockA.x - blockB.x;
      });

      // Process queue
      while (queue.length > 0) {
        const startId = queue.shift()!;
        if (visited.has(startId)) continue;

        // Build horizontal chain for this line
        const line = buildHorizontalChain(startId);
        if (line.length > 0) {
          lineGroups.push(line);

          // Add blocks below this line to queue, maintaining connection order
          // For vertical chains, follow the connection order (not position-based)
          const bottomBlocks: number[] = [];
          const processedBottomIds = new Set<number>();
          
          for (const id of line) {
            const conn = connections[id] || {};
            if (conn.bottom && !visited.has(conn.bottom) && !processedBottomIds.has(conn.bottom)) {
              bottomBlocks.push(conn.bottom);
              processedBottomIds.add(conn.bottom);
            }
          }
          
          // If we have multiple bottom connections, sort by position to maintain visual order
          // But prioritize following the connection chain when possible
          if (bottomBlocks.length > 1) {
            bottomBlocks.sort((idA, idB) => {
              const blockA = idToBlock.get(idA);
              const blockB = idToBlock.get(idB);
              if (!blockA || !blockB) return 0;
              // Sort by Y position (top to bottom)
              const yDiff = blockA.y - blockB.y;
              if (Math.abs(yDiff) > 10) return yDiff;
              // If roughly same Y, sort by X (left to right)
              return blockA.x - blockB.x;
            });
          }
          
          // Add to end of queue to maintain processing order
          queue.push(...bottomBlocks);
        }
      }

      // Add any remaining unvisited blocks
      for (const block of componentBlocks) {
        if (!visited.has(block.id)) {
          lineGroups.push([block.id]);
        }
      }

      // Build text for each line
      for (const lineIds of lineGroups) {
        const lineBlocks = lineIds.map(id => idToBlock.get(id)!).filter(Boolean);
        if (lineBlocks.length === 0) continue;

        // Track which block IDs contribute to this line
        lineToBlockIds.set(lineIndex, lineIds);

        // Join blocks in the line
        const parts: string[] = [];
        for (let i = 0; i < lineBlocks.length; i++) {
          const block = lineBlocks[i];
          const conn = connections[block.id] || {};
          const prevBlock = i > 0 ? lineBlocks[i - 1] : null;

          // If connected horizontally (left/right), join without space
          if (prevBlock && (conn.left === prevBlock.id || (connections[prevBlock.id] || {}).right === block.id)) {
            parts.push(block.text);
          } else {
            // Not connected, add space
            if (parts.length > 0) parts.push(' ');
            parts.push(block.text);
          }
        }
        lines.push(parts.join(''));
        lineIndex++;
    }
      lines.push('');
    }

    return { text: lines.join('\n').trimEnd(), lineToBlockIds };
  }

  function computeProgramText(): string {
    return computeProgramTextWithBlockIds().text;
  }

  function analyzeFirstMismatch(): {
    type: 'missing' | 'extra' | 'misplaced';
    index: number;
    expectedLine: string | null;
    actualLine: string | null;
    actualBlockIds?: number[]; // Block IDs contributing to the actual line
  } | null {
    const { text: programText, lineToBlockIds } = computeProgramTextWithBlockIds();
    const normalizedActual = normalizeProgramString(programText);
    const normalizedExpected = canonicalLines;
    
    let actualIdx = 0;
    let expectedIdx = 0;
    
    while (actualIdx < normalizedActual.length || expectedIdx < normalizedExpected.length) {
      const expectedLine = expectedIdx < normalizedExpected.length ? normalizedExpected[expectedIdx] : null;
      const actualLine = actualIdx < normalizedActual.length ? normalizedActual[actualIdx] : null;
      
      if (expectedLine && !actualLine) {
        return { type: 'missing' as const, index: expectedIdx, expectedLine, actualLine: null };
      }
      
      if (!expectedLine && actualLine) {
        const actualBlockIds = lineToBlockIds.get(actualIdx);
        return { type: 'extra' as const, index: actualIdx, expectedLine: null, actualLine, actualBlockIds };
      }
      
      if (expectedLine && actualLine) {
        const normalizedExpectedLine = normalizeLineText(expectedLine);
        const normalizedActualLine = normalizeLineText(actualLine);
        
        // Check if actual line matches expected line exactly
        if (normalizedExpectedLine === normalizedActualLine) {
          actualIdx++;
          expectedIdx++;
          continue;
        }
        
        // Check if actual line is a combination of expected line and next expected line(s) (horizontal connection)
        let combinedExpected = normalizedExpectedLine;
        let checkIdx = expectedIdx + 1;
        let foundHorizontalMatch = false;
        
        // Try combining consecutive expected lines that should connect horizontally
        while (checkIdx < normalizedExpected.length) {
          const prevExpected = normalizedExpected[checkIdx - 1];
          const nextExpected = normalizedExpected[checkIdx];
          if (shouldConnectHorizontally(prevExpected, nextExpected)) {
            combinedExpected += normalizeLineText(nextExpected);
            if (normalizedActualLine === combinedExpected) {
              // Matches! This is a horizontal connection, advance both indices
              actualIdx++;
              expectedIdx = checkIdx + 1;
              foundHorizontalMatch = true;
              break;
            }
            checkIdx++;
          } else {
            break;
          }
        }
        
        // If we found a match through horizontal combination, continue to next iteration
        if (foundHorizontalMatch) {
          continue;
        }
        
        // No match found - this is a mismatch
        const actualBlockIds = lineToBlockIds.get(actualIdx);
        return { type: 'misplaced' as const, index: expectedIdx, expectedLine, actualLine, actualBlockIds };
      }
      
      // Fallback: advance indices
      if (expectedLine) expectedIdx++;
      if (actualLine) actualIdx++;
    }
    
    return null;
  }

  const isCanonicalBlockText = React.useCallback((text: string | null | undefined) => {
    if (!text) return false
    return canonicalNormalizedSet.has(normalizeLineText(text))
  }, [canonicalNormalizedSet])

  const findBlockIdByNormalizedText = React.useCallback((text: string | null, preferDisconnected: boolean = false, excludeIds?: Set<number>) => {
    if (!text) return null;
    const normalized = normalizeLineText(text);
    
    // Only consider blocks that are part of the canonical solution
    // This prevents connecting extra/random blocks that aren't in the solution
    // If preferDisconnected is true, first try to find a disconnected block
    if (preferDisconnected) {
      const disconnectedBlock = blocks.find(b => {
        const blockConn = connections[b.id] || {};
        const hasConnections = blockConn.top || blockConn.bottom || blockConn.left || blockConn.right;
        if (excludeIds?.has(b.id)) return false;
        return normalizeLineText(b.text) === normalized && !hasConnections && isCanonicalBlockText(b.text);
      });
      if (disconnectedBlock) return disconnectedBlock.id;
    }
    
    // Fallback to any matching block that's part of the canonical solution
    const block = blocks.find(b => 
      normalizeLineText(b.text) === normalized && isCanonicalBlockText(b.text) && !excludeIds?.has(b.id)
    );
    return block?.id ?? null;
  }, [blocks, connections, isCanonicalBlockText]);

  const generateSyntaxHint = React.useCallback(() => {
    const mismatch = analyzeFirstMismatch();
    if (!mismatch) {
      return { message: 'All blocks are currently in the correct order. Nice work!', highlight: [] as number[] };
    }
    let message = '';
    let highlight: number[] = [];
    if (mismatch.type === 'missing' && mismatch.expectedLine) {
      message = `Block #${mismatch.index + 1} should be "${mismatch.expectedLine}". Find that block and place it in this position.`;
      const blockId = findBlockIdByNormalizedText(mismatch.expectedLine);
      if (blockId != null) highlight = [blockId];
    } else if (mismatch.type === 'extra' && mismatch.actualLine) {
      message = `You have an unexpected block at position #${mismatch.index + 1}: "${mismatch.actualLine}". Try moving it elsewhere.`;
      const blockId = findBlockIdByNormalizedText(mismatch.actualLine);
      if (blockId != null) highlight = [blockId];
    } else if (mismatch.expectedLine && mismatch.actualLine) {
      message = `Block "${mismatch.actualLine}" is in the wrong spot. "${mismatch.expectedLine}" should be at position #${mismatch.index + 1}.`;
      const blockId = findBlockIdByNormalizedText(mismatch.actualLine);
      if (blockId != null) highlight = [blockId];
    }
    return { message, highlight };
  }, [findBlockIdByNormalizedText]);

  const autoFixOneBlock = React.useCallback(() => {
    // First, analyze the complete correct code structure and build a layout plan
    const { text: programText, lineToBlockIds } = computeProgramTextWithBlockIds();
    const normalizedActual = normalizeProgramString(programText);
    const normalizedExpected = canonicalLines;
    
    // Build the correct layout plan: for each expected line, find its block and calculate target position
    interface BlockLayoutPlan {
      blockId: number;
      targetIndex: number;
      targetX: number;
      targetY: number;
      connectHorizontally: boolean;
      needsMove: boolean;
    }
    
    const layoutPlan: BlockLayoutPlan[] = [];
    const usedBlockIds = new Set<number>();
    let currentX = margin + 20;
    let currentY = margin;
    let maxWidthInRow = 0;
    
    // First pass: build the layout plan for all expected blocks
    for (let i = 0; i < normalizedExpected.length; i++) {
      const expectedLine = normalizedExpected[i];
      const nextLine = i + 1 < normalizedExpected.length ? normalizedExpected[i + 1] : null;
      const connectHorizontally = shouldConnectHorizontally(expectedLine, nextLine);
      
      // Find the block that should be at this position
      const blockId =
        findBlockIdByNormalizedText(expectedLine, true, usedBlockIds)
        || findBlockIdByNormalizedText(expectedLine, false, usedBlockIds);
      
      if (blockId != null) {
        usedBlockIds.add(blockId);
        const block = blocks.find(b => b.id === blockId);
        if (block) {
          const layout = computeBlockLayout(block.text, scale);
          
          // Calculate target position
          let targetX = currentX;
          let targetY = currentY;
          
          // Check if we need to move to a new row (vertical connection)
          if (!connectHorizontally && i > 0) {
            // Move to new row
            currentX = margin + 20;
            currentY += maxWidthInRow > 0 ? (maxWidthInRow + padding) : (layout.h + padding);
            maxWidthInRow = 0;
            targetX = currentX;
            targetY = currentY;
          }
          
          // Check if block is already in correct position (with tolerance)
          const tolerance = 30;
          const needsMove = Math.abs(block.x - targetX) > tolerance || Math.abs(block.y - targetY) > tolerance;
          
          layoutPlan.push({
            blockId,
            targetIndex: i,
            targetX,
            targetY,
            connectHorizontally,
            needsMove
          });
          
          // Update position for next block
          if (connectHorizontally) {
            currentX += layout.w + padding;
            maxWidthInRow = Math.max(maxWidthInRow, layout.w);
          } else {
            currentY += layout.h + padding;
            maxWidthInRow = Math.max(maxWidthInRow, layout.w);
          }
        }
      }
    }
    const layoutPlanByIndex = new Map<number, BlockLayoutPlan>();
    const layoutPlanByBlockId = new Map<number, BlockLayoutPlan>();
    for (const plan of layoutPlan) {
      layoutPlanByIndex.set(plan.targetIndex, plan);
      layoutPlanByBlockId.set(plan.blockId, plan);
    }
    
    const isPureBraceLine = (line: string | null | undefined): boolean => {
      if (!line) return false
      const n = normalizeLineText(line)
      return n === '{' || n === '}'
    }
    
    const getCorrectAnchorForIndex = (index: number): { id: number; block: Block } | null => {
      if (index < 0) return null;
      const expectedLine = normalizedExpected[index];
      if (!expectedLine) return null;
      const normalizedExpectedText = normalizeLineText(expectedLine);
      
      // 1) Prefer whatever block the student already placed in this sequence slot,
      //    even if it's not aligned with the precomputed layout. This keeps their
      //    progress intact and lets us connect future auto-fixes to those anchors.
      const actualLine = normalizedActual[index];
      if (actualLine) {
        const normalizedActualText = normalizeLineText(actualLine);
        if (normalizedActualText === normalizedExpectedText) {
          const blockIdsAtLine = lineToBlockIds.get(index);
          if (blockIdsAtLine && blockIdsAtLine.length > 0) {
            const candidateId = blockIdsAtLine[blockIdsAtLine.length - 1];
            const candidateBlock = blocks.find(b => b.id === candidateId);
            if (candidateBlock) {
              return { id: candidateId, block: candidateBlock };
            }
          }
        }
      }
      // 2) Fallback to the layout plan if we can't rely on the live board layout.
      const plan = layoutPlanByIndex.get(index);
      if (!plan) return null;
      const block = blocks.find(b => b.id === plan.blockId);
      if (!block) return null;
      const tolerance = 35;
      const aligned =
        Math.abs(block.x - plan.targetX) <= tolerance &&
        Math.abs(block.y - plan.targetY) <= tolerance;
      if (!aligned) return null;
      return { id: plan.blockId, block };
    };

    // Analyze the current state and expected code structure
    const mismatch = analyzeFirstMismatch();
    if (!mismatch) {
      return { message: 'Everything is already in the correct order!', highlight: [] as number[] };
    }
    
    // RULE: The first correct block(s) should stay put and not be moved
    // We only swap blocks starting from the first mismatch position
    // This ensures we preserve correct work the student has already done
    
    // Find which blocks are already correct at the beginning (before the mismatch)
    // These blocks should NOT be moved
    const correctBlockIdsBeforeMismatch = new Set<number>();
    if (mismatch.index > 0) {
      // Check each position before the mismatch
      for (let i = 0; i < mismatch.index; i++) {
        const expectedLine = canonicalLines[i];
        const actualLine = normalizedActual[i];
        
        if (expectedLine && actualLine) {
          const normalizedExpected = normalizeLineText(expectedLine);
          const normalizedActualLine = normalizeLineText(actualLine);
          
          // If they match, these blocks are correct and should stay put
          if (normalizedExpected === normalizedActualLine) {
            const blockIds = lineToBlockIds.get(i);
            if (blockIds) {
              blockIds.forEach(id => {
                const candidate = blocks.find(b => b.id === id)
                if (candidate && isCanonicalBlockText(candidate.text)) {
                  correctBlockIdsBeforeMismatch.add(id)
                }
              });
            }
          }
        }
      }
    }
    
    // Handle misplaced blocks: if a block is in the wrong position, swap it with the correct one
    let targetBlockId: number | null = null;
    let targetIndex = mismatch.index;
    let swapBlockId: number | null = null; // Block that's currently in the wrong position
    
    if (mismatch.type === 'misplaced' && mismatch.expectedLine && mismatch.actualLine) {
      // Normalize the expected and actual lines for comparison
      const normalizedExpectedText = normalizeLineText(mismatch.expectedLine);
      const normalizedActualText = normalizeLineText(mismatch.actualLine);
      
      // STEP 1: Identify the block that's currently at the wrong position (swapBlockId)
      // Use actualBlockIds as the source of truth - these are the blocks at the mismatch position
      // The actualBlockIds contain the block(s) that are currently at position mismatch.index in the actual sequence
      if (mismatch.actualBlockIds && mismatch.actualBlockIds.length > 0) {
        // Special case: When multiple blocks are combined (horizontally connected),
        // we need to identify which specific block is wrong
        if (mismatch.actualBlockIds.length > 1) {
          // When blocks are combined, the actualLine is the combined text
          // We need to find which block in the sequence doesn't match what's expected
          // Strategy: Check each block to see if it matches the expected line at the mismatch position
          // If none match, the block that's at the mismatch position (usually the last in the combined line) is wrong
          
          let foundCorrectBlock = false;
          for (let i = 0; i < mismatch.actualBlockIds.length; i++) {
            const blockId = mismatch.actualBlockIds[i];
            const block = blocks.find(b => b.id === blockId);
            if (!block) continue;
            if (!isCanonicalBlockText(block.text)) continue;
            
            const normalizedBlockText = normalizeLineText(block.text);
            
            // Check if this block matches the expected line at the mismatch position
            if (normalizedBlockText === normalizedExpectedText) {
              // This block is the correct one that should be at this position
              foundCorrectBlock = true;
              // If this is not the last block, the blocks after it are wrong
              // But actually, if this block matches expected, it means the OTHER blocks in the combined line are wrong
              // The block that's actually wrong is the one that's causing the mismatch
              // Since the combined line doesn't match expected, and this block does match,
              // the other blocks must be wrong
              for (let j = i + 1; j < mismatch.actualBlockIds.length; j++) {
                const wrongBlockId = mismatch.actualBlockIds[j];
                const wrongBlock = blocks.find(b => b.id === wrongBlockId);
                if (wrongBlock && isCanonicalBlockText(wrongBlock.text)) {
                  const wrongBlockText = normalizeLineText(wrongBlock.text);
                  if (wrongBlockText !== normalizedExpectedText) {
                    swapBlockId = wrongBlockId;
                    break;
                  }
                }
              }
              if (swapBlockId) break;
            }
          }
          
          // If we found the correct block but didn't identify a swap block,
          // or if no block matches expected, find the block that's wrong
          if (!swapBlockId) {
            // Find the block that doesn't match expected and is a canonical block
            for (let i = mismatch.actualBlockIds.length - 1; i >= 0; i--) {
              const blockId = mismatch.actualBlockIds[i];
              const block = blocks.find(b => b.id === blockId);
              if (!block) continue;
              
              const normalizedBlockText = normalizeLineText(block.text);
              
              // This block is wrong if it doesn't match expected
              if (normalizedBlockText !== normalizedExpectedText) {
                if (isCanonicalBlockText(block.text)) {
                  swapBlockId = blockId;
                  break;
                }
              }
            }
          }
          
          // Last resort: use the last block in the combined line
          // (usually the wrong block is the one that's incorrectly connected)
          if (!swapBlockId && mismatch.actualBlockIds.length > 1) {
            swapBlockId = mismatch.actualBlockIds[mismatch.actualBlockIds.length - 1];
          }
        }
        
        // For single block or if we haven't found a swap block yet
        if (!swapBlockId) {
          // Find the primary block at the wrong position
          // Priority 1: block whose text exactly matches actualLine (single block case)
          // Priority 2: first canonical block that doesn't match expected
          // Priority 3: first block from actualBlockIds
          
          for (const blockId of mismatch.actualBlockIds) {
            const block = blocks.find(b => b.id === blockId);
            if (!block) continue;
            
            const normalizedBlockText = normalizeLineText(block.text);
            
            // Priority 1: Exact match with actualLine
            if (normalizedBlockText === normalizedActualText) {
              if (isCanonicalBlockText(block.text)) {
                swapBlockId = blockId;
                break; // Found exact match, use this one
              }
            }
          }
          
          // Priority 2: If no exact match, find first canonical block that doesn't match expected
          if (!swapBlockId) {
            for (const blockId of mismatch.actualBlockIds) {
              const block = blocks.find(b => b.id === blockId);
              if (!block) continue;
              
              const normalizedBlockText = normalizeLineText(block.text);
              
              // This block is at wrong position if it doesn't match expected
              if (normalizedBlockText !== normalizedExpectedText) {
              if (isCanonicalBlockText(block.text)) {
                  swapBlockId = blockId;
                  break;
                }
              }
            }
          }
          
          // Priority 3: Last resort - use first block from actualBlockIds
          // This is the block that's actually at the mismatch position in the sequence
          if (!swapBlockId && mismatch.actualBlockIds.length > 0) {
            const fallbackId = mismatch.actualBlockIds.find(id => {
              const block = blocks.find(b => b.id === id);
              return block && isCanonicalBlockText(block.text);
            });
            swapBlockId = fallbackId ?? mismatch.actualBlockIds[0];
          }
        }
      } else {
        // Fallback: find block by text matching actualLine
        // But we need to be careful - this might find a block that's not at the wrong position
        const actualNormalized = normalizeLineText(mismatch.actualLine);
        const matchingBlocks = blocks.filter(block => {
          if (!isCanonicalBlockText(block.text)) return false;
          const normalizedBlockText = normalizeLineText(block.text);
          if (normalizedBlockText !== actualNormalized) return false;
          return true;
        });
        
        if (matchingBlocks.length > 0) {
          swapBlockId = matchingBlocks[0].id;
        }
      }
      
      // STEP 2: Find the block that SHOULD be at this position (targetBlockId)
      // Prefer disconnected blocks first, then any matching block
      // IMPORTANT: Don't use blocks that are already correctly positioned before the mismatch
      const planForIndex = layoutPlanByIndex.get(mismatch.index);
      if (planForIndex && !correctBlockIdsBeforeMismatch.has(planForIndex.blockId)) {
        targetBlockId = planForIndex.blockId;
      }
      if (!targetBlockId) {
        targetBlockId = findBlockIdByNormalizedText(mismatch.expectedLine, true) || findBlockIdByNormalizedText(mismatch.expectedLine, false);
      }
      
      // Special case: If we have multiple blocks combined and one of them matches expected,
      // that block should be the target (it's already there, just needs to be disconnected and repositioned)
      if (mismatch.actualBlockIds && mismatch.actualBlockIds.length > 1 && !targetBlockId) {
        const normalizedExpectedText = normalizeLineText(mismatch.expectedLine);
        for (const blockId of mismatch.actualBlockIds) {
          const block = blocks.find(b => b.id === blockId);
          if (!block || !isCanonicalBlockText(block.text)) continue;
          const normalizedBlockText = normalizeLineText(block.text);
          if (normalizedBlockText === normalizedExpectedText) {
            targetBlockId = blockId;
            break;
          }
        }
      }
      
      // If the target block is already correctly positioned before the mismatch, find a different one
      if (targetBlockId && correctBlockIdsBeforeMismatch.has(targetBlockId)) {
        // Find another block with the same text that's not already correctly positioned
        const normalizedExpectedText = normalizeLineText(mismatch.expectedLine);
        const alternativeTarget = blocks.find(block => {
          if (correctBlockIdsBeforeMismatch.has(block.id)) return false;
          if (!isCanonicalBlockText(block.text)) return false;
          const normalizedBlockText = normalizeLineText(block.text);
          if (normalizedBlockText !== normalizedExpectedText) return false;
          return true;
        });
        if (alternativeTarget) {
          targetBlockId = alternativeTarget.id;
        }
      }
      
      // Final safety check: ensure swapBlockId and targetBlockId are different
      if (swapBlockId === targetBlockId) {
        // If they're the same, we can't swap - try to find a different target block
        // This might happen if the same block text appears in multiple positions
        const allMatchingTargetBlocks = blocks.filter(block => {
          if (correctBlockIdsBeforeMismatch.has(block.id)) return false; // Don't use already correct blocks
          if (block.id === swapBlockId) return false;
          if (!isCanonicalBlockText(block.text)) return false;
          const normalizedBlockText = normalizeLineText(block.text);
          if (normalizedBlockText !== normalizedExpectedText) return false;
          return true;
        });
        
        if (allMatchingTargetBlocks.length > 0) {
          targetBlockId = allMatchingTargetBlocks[0].id;
        } else {
          // Can't find a different target block - clear swapBlockId to just move target
          swapBlockId = null;
        }
      }
      
      // Ensure we're not trying to move blocks that are already correct
      if (swapBlockId && correctBlockIdsBeforeMismatch.has(swapBlockId)) {
        // This block is already correct, don't swap it
        swapBlockId = null;
      }
      
      // If we found both blocks and they're different, we'll swap them
      if (targetBlockId && swapBlockId && targetBlockId !== swapBlockId) {
        // Get the layout plan for the correct block - it should go to the mismatch position
        const targetPlan = layoutPlanByBlockId.get(targetBlockId);
        if (targetPlan) {
          targetIndex = targetPlan.targetIndex;
        } else {
          // Fallback: use mismatch index
          targetIndex = mismatch.index;
        }
      } else if (targetBlockId) {
        // Only the correct block found, just move it
        const targetPlan = layoutPlanByBlockId.get(targetBlockId);
        if (targetPlan) {
          targetIndex = targetPlan.targetIndex;
        } else {
          targetIndex = mismatch.index;
        }
      }
    } else if (mismatch.type === 'missing' && mismatch.expectedLine) {
      // Block is missing - find it and place it
      const planForIndex = layoutPlanByIndex.get(mismatch.index);
      if (planForIndex && !correctBlockIdsBeforeMismatch.has(planForIndex.blockId)) {
        targetBlockId = planForIndex.blockId;
      }
      if (!targetBlockId) {
        targetBlockId = findBlockIdByNormalizedText(mismatch.expectedLine, true) || findBlockIdByNormalizedText(mismatch.expectedLine, false);
      }
      targetIndex = mismatch.index;
    } else if (mismatch.type === 'extra' && mismatch.actualLine) {
      // Extra block - find where it should go
      // Use actualBlockIds if available to identify the actual block
      if (mismatch.actualBlockIds && mismatch.actualBlockIds.length > 0) {
        targetBlockId = mismatch.actualBlockIds[0];
      } else {
        targetBlockId = findBlockIdByNormalizedText(mismatch.actualLine, true);
      }
      
      if (targetBlockId) {
        const actualNormalized = normalizeLineText(mismatch.actualLine);
        for (let i = 0; i < canonicalLines.length; i++) {
          if (normalizeLineText(canonicalLines[i]) === actualNormalized) {
            targetIndex = i;
            break;
          }
        }
      }
    }
    
    if (!targetBlockId && mismatch) {
      if (mismatch.type === 'missing' && mismatch.expectedLine) {
        const normalized = normalizeLineText(mismatch.expectedLine);
        const fallbackBlock = blocks.find(b => normalizeLineText(b.text) === normalized);
        if (fallbackBlock) targetBlockId = fallbackBlock.id;
      } else if (mismatch.type === 'extra' && mismatch.actualLine) {
        const normalized = normalizeLineText(mismatch.actualLine);
        const fallbackBlock = blocks.find(b => normalizeLineText(b.text) === normalized);
        if (fallbackBlock) targetBlockId = fallbackBlock.id;
      } else if (mismatch.actualLine) {
        const normalized = normalizeLineText(mismatch.actualLine);
        const fallbackBlock = blocks.find(b => normalizeLineText(b.text) === normalized);
        if (fallbackBlock) targetBlockId = fallbackBlock.id;
      }
    }
    
    if (!targetBlockId) {
      return { message: 'Cannot find the block to adjust. Please try rearranging blocks manually.', highlight: [] as number[] };
    }
    
    const block = blocks.find(b => b.id === targetBlockId);
    if (!block) {
      return { message: 'Block not found in the board.', highlight: [] as number[] };
    }
    
    const layout = computeBlockLayout(block.text, scale);
    
    // Get the layout plan for the target block
    const targetPlan = layoutPlanByBlockId.get(targetBlockId);
    let finalX: number;
    let finalY: number;
    let connectHorizontallyToPrevPlan = targetPlan?.connectHorizontally ?? false;
    
    if (targetPlan) {
      finalX = targetPlan.targetX;
      finalY = targetPlan.targetY;
      connectHorizontallyToPrevPlan = targetPlan.connectHorizontally;
    } else if (mismatch?.type === 'extra') {
      // Move unexpected blocks to a safe parking zone instead of failing
      const safeX = boardWidth - margin - layout.w - 40;
      const safeY = canvasHeight - margin - layout.h - 40;
      finalX = Math.max(margin, safeX);
      finalY = Math.max(margin, safeY);
    } else {
      return { message: 'Cannot find the block to adjust. Please try rearranging blocks manually.', highlight: [] as number[] };
    }
    
    // If we need to swap blocks, get the current position of the target block
    // The swap block will go to where the target block currently is
    let swapBlockFinalX: number | null = null;
    let swapBlockFinalY: number | null = null;
    if (swapBlockId && swapBlockId !== targetBlockId) {
      const swapBlock = blocks.find(b => b.id === swapBlockId);
      if (swapBlock && block) {
        // Check if blocks are connected - if so, we need to move swap block away
        const targetConn = connections[targetBlockId] || {};
        const swapConn = connections[swapBlockId] || {};
        const areConnected = targetConn.left === swapBlockId || targetConn.right === swapBlockId ||
                             targetConn.top === swapBlockId || targetConn.bottom === swapBlockId ||
                             swapConn.left === targetBlockId || swapConn.right === targetBlockId ||
                             swapConn.top === targetBlockId || swapConn.bottom === targetBlockId;
        
        if (areConnected) {
          // Blocks are connected - move swap block to a safe position away from target
          // Place it to the right and slightly below the target block's current position
          const swapLayout = computeBlockLayout(swapBlock.text, scale);
          swapBlockFinalX = block.x + layout.w + padding + 20;
          swapBlockFinalY = block.y + layout.h + padding;
          
          // Ensure swap block position is within bounds
          const swapMaxX = boardWidth - margin - swapLayout.w;
          swapBlockFinalX = Math.max(margin, Math.min(swapMaxX, swapBlockFinalX));
          swapBlockFinalY = Math.max(margin, Math.min(swapBlockFinalY, canvasHeight - margin - swapLayout.h));
        } else {
          // Blocks are not connected - do a true swap
          // The swap block should go to where the target block currently is
          // This creates a true swap: 
          // - Target block (correct) goes to its correct position (finalX, finalY)
          // - Swap block (wrong) goes to target block's current position (block.x, block.y)
          swapBlockFinalX = block.x;
          swapBlockFinalY = block.y;
          
          // Ensure swap block position is within bounds
          const swapLayout = computeBlockLayout(swapBlock.text, scale);
          const swapMaxX = boardWidth - margin - swapLayout.w;
          swapBlockFinalX = Math.max(margin, Math.min(swapMaxX, swapBlockFinalX));
          swapBlockFinalY = Math.max(margin, Math.min(swapBlockFinalY, canvasHeight - margin - swapLayout.h));
        }
      }
    }
    
    // Find previous and next blocks for connections
    // IMPORTANT: The previous block should be the one that's already correctly positioned
    // (before the mismatch), so we connect the target block to it
    const expectedLineAtTarget = targetIndex >= 0 && targetIndex < normalizedExpected.length
      ? normalizedExpected[targetIndex]
      : mismatch?.expectedLine || block.text;
    const prevExpectedLine = targetIndex > 0 ? normalizedExpected[targetIndex - 1] : null;
    const nextExpectedLine = targetIndex + 1 < normalizedExpected.length ? normalizedExpected[targetIndex + 1] : null;
    let connectHorizontallyToPrev = prevExpectedLine && expectedLineAtTarget
      ? shouldConnectHorizontally(prevExpectedLine, expectedLineAtTarget)
      : connectHorizontallyToPrevPlan;
    const connectHorizontallyToNext = nextExpectedLine && expectedLineAtTarget
      ? shouldConnectHorizontally(expectedLineAtTarget, nextExpectedLine)
      : false;
    let nextBlockId: number | null = null;
    let forceConnectToNext = false;
    
    let prevBlockId: number | null = null;
    let prevBlock: Block | null = null;
    let anchorFromNext: { id: number; block: Block } | null = null;
    if (prevExpectedLine && targetIndex > 0) {
      // Check if the previous position is already correct
      const prevActualLine = normalizedActual[targetIndex - 1];
      if (prevActualLine) {
        const normalizedPrevExpected = normalizeLineText(prevExpectedLine);
        const normalizedPrevActual = normalizeLineText(prevActualLine);
        
        // If previous position is correct, use the block from there
        if (normalizedPrevExpected === normalizedPrevActual) {
          const prevBlockIds = lineToBlockIds.get(targetIndex - 1);
          if (prevBlockIds && prevBlockIds.length > 0) {
            // Use the last block in the line (rightmost if horizontal, bottommost if vertical)
            prevBlockId = prevBlockIds[prevBlockIds.length - 1];
            prevBlock = blocks.find(b => b.id === prevBlockId) || null;
          }
        }
      }
      
      // Fallback: find by text matching
      if (!prevBlockId) {
        prevBlockId = findBlockIdByNormalizedText(prevExpectedLine);
        if (prevBlockId) {
          prevBlock = blocks.find(b => b.id === prevBlockId) || null;
        }
      }

      if (!prevBlockId) {
        const anchor = getCorrectAnchorForIndex(targetIndex - 1);
        if (anchor) {
          prevBlockId = anchor.id;
          prevBlock = anchor.block;
        }
      }
    }
    
    if (!prevBlockId) {
      const ensureAnchorIsEligible = (candidate: { id: number; block: Block } | null) => {
        if (!candidate) return null;
        if (candidate.id === targetBlockId) return null;
        if (!correctBlockIdsBeforeMismatch.has(candidate.id)) return null;
        return candidate;
      };
      
      // Find the first correct block in the canonical sequence that exists on the board.
      // We only consider blocks that are already correct at their sequence index,
      // never arbitrary text matches. This guarantees we anchor to truly-correct
      // prefixes (e.g. the opening class line) instead of “similar” lines.
      const findFirstCorrectAnchor = (limitIndex?: number) => {
        const maxIndex = typeof limitIndex === 'number'
          ? Math.min(limitIndex, normalizedExpected.length)
          : normalizedExpected.length;
        
        // Look for perfectly aligned blocks (like in beginner lessons)
        for (let i = 0; i < maxIndex; i++) {
          const anchor = ensureAnchorIsEligible(getCorrectAnchorForIndex(i));
          if (anchor) {
            return anchor;
          }
        }
        
        return null;
      };
      
      // Helper to find the last block in a connected chain starting from a given block
      const findLastInChain = (startBlockId: number): { id: number; block: Block } | null => {
        const visited = new Set<number>();
        let currentId: number | null = startBlockId;
        let lastBlock: Block | null = null;
        
        while (currentId != null && !visited.has(currentId)) {
          visited.add(currentId);
          const currentBlock = blocks.find(b => b.id === currentId);
          if (!currentBlock) break;
          
          lastBlock = currentBlock;
          const conn = connections[currentId] || {};
          
          // Follow the connection chain (prioritize bottom, then right for vertical-first layout)
          if (conn.bottom && !visited.has(conn.bottom)) {
            currentId = conn.bottom;
          } else if (conn.right && !visited.has(conn.right)) {
            currentId = conn.right;
          } else {
            currentId = null;
          }
        }
        
        const candidate = lastBlock ? { id: lastBlock.id, block: lastBlock } : null;
        return ensureAnchorIsEligible(candidate);
      };
      
      // Always prioritize the first block (index 0) if it exists - this works for all levels like level 1
      // Strategy: Find the first correct block, then find the end of its chain (if connected), or use it directly
      let anchor: { id: number; block: Block } | null = null;
      
      // Step 1: Try to find the first block (index 0) that's perfectly aligned
      const firstAnchor = ensureAnchorIsEligible(getCorrectAnchorForIndex(0));
      if (firstAnchor) {
        // Check if this block has connections - if so, find the end of the chain
        const conn = connections[firstAnchor.id] || {};
        if (conn.bottom || conn.right) {
          const chainEnd = findLastInChain(firstAnchor.id);
          anchor = chainEnd || firstAnchor;
        } else {
          // Block is disconnected - use it directly (this is the level 1 behavior)
          anchor = firstAnchor;
        }
      }
      
      // Step 2: If no perfectly aligned first block, try to find it by text matching
      if (!anchor || anchor.id === targetBlockId) {
        if (normalizedExpected.length > 0) {
          const firstExpectedLine = normalizedExpected[0];
          const firstBlockId = findBlockIdByNormalizedText(firstExpectedLine, false);
          if (firstBlockId) {
            const firstBlock = blocks.find(b => b.id === firstBlockId);
            if (firstBlock) {
              // Check if this block has connections
              const conn = connections[firstBlockId] || {};
              if (conn.bottom || conn.right) {
                // Has connections - find the end of the chain
                const chainEnd = findLastInChain(firstBlockId);
                anchor = chainEnd || ensureAnchorIsEligible({ id: firstBlockId, block: firstBlock });
              } else {
                // No connections - use it directly (like level 1 when blocks are disconnected)
                anchor = ensureAnchorIsEligible({ id: firstBlockId, block: firstBlock });
              }
            }
          }
        }
      }
      
      // Step 3: If still no anchor, look for any correct block in sequence (working backwards from mismatch)
      if (!anchor || anchor.id === targetBlockId) {
        // Check blocks before the mismatch position
        for (let i = Math.min(mismatch.index - 1, normalizedExpected.length - 1); i >= 0; i--) {
          const expectedLine = normalizedExpected[i];
          if (!expectedLine) continue;
          
          // Check if this position is correct in actual sequence
          if (i < normalizedActual.length) {
            const actualLine = normalizedActual[i];
            if (actualLine) {
              const normalizedExpectedText = normalizeLineText(expectedLine);
              const normalizedActualText = normalizeLineText(actualLine);
              if (normalizedExpectedText === normalizedActualText) {
                // This position is correct! Find the block(s) at this position
                const blockIds = lineToBlockIds.get(i);
                if (blockIds && blockIds.length > 0) {
                  const candidateId = blockIds[blockIds.length - 1];
                  const candidateBlock = blocks.find(b => b.id === candidateId);
                  if (candidateBlock) {
                    // Check if it has connections
                    const conn = connections[candidateId] || {};
                    if (conn.bottom || conn.right) {
                      const chainEnd = findLastInChain(candidateId);
                      if (chainEnd) {
                        anchor = chainEnd;
                        break;
                      }
                    } else {
                      const candidate = ensureAnchorIsEligible({ id: candidateId, block: candidateBlock });
                      if (candidate) {
                        anchor = candidate;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Step 4: Final fallback - use general search
      if (!anchor || anchor.id === targetBlockId) {
        anchor = findFirstCorrectAnchor(mismatch.index);
      }
      if (!anchor || anchor.id === targetBlockId) {
        anchor = null;
      }
      
      if (anchor) {
        prevBlockId = anchor.id;
        prevBlock = anchor.block;
      }
    }

    if (!prevBlockId && nextExpectedLine) {
      // Prefer the canonical plan block for the *next* index to avoid
      // accidentally choosing the wrong '{' or '}' when there are duplicates.
      const planNext = layoutPlanByIndex.get(targetIndex + 1);
      if (planNext) {
        const block = blocks.find(b => b.id === planNext.blockId);
        if (block && isCanonicalBlockText(block.text)) {
          anchorFromNext = { id: block.id, block };
        }
      }
      // If we still don't have an anchor, only then fall back to text-based
      // matching, and skip pure brace lines to prevent wrong scope selection.
      if (!anchorFromNext && !isPureBraceLine(nextExpectedLine)) {
        const normalizedNext = normalizeLineText(nextExpectedLine);
        const excluded = new Set<number>([targetBlockId]);
        correctBlockIdsBeforeMismatch.forEach(id => excluded.add(id));
        const connectedCandidate = blocks.find(block => {
          if (excluded.has(block.id)) return false;
          if (!isCanonicalBlockText(block.text)) return false;
          if (normalizeLineText(block.text) !== normalizedNext) return false;
          const conn = connections[block.id] || {};
          return !!(conn.top || conn.bottom || conn.left || conn.right);
        });
        const fallbackCandidate = connectedCandidate || blocks.find(block => {
          if (excluded.has(block.id)) return false;
          if (!isCanonicalBlockText(block.text)) return false;
          return normalizeLineText(block.text) === normalizedNext;
        });
        if (fallbackCandidate) {
          anchorFromNext = { id: fallbackCandidate.id, block: fallbackCandidate };
        }
      }
    }
    
    // If we have a previous block that's correctly positioned, calculate position based on its socket
    // This connects directly to the correct block instead of using absolute positioning
    if (prevBlock && prevBlockId) {
      const prevSockets = getSockets(prevBlock);
      
      if (connectHorizontallyToPrev) {
        // Connect horizontally: position to the right of previous block
        finalX = Math.round(prevSockets.right.x);
        finalY = Math.round(prevSockets.right.y - layout.h / 2);
      } else {
        // Connect vertically: position below previous block
        finalX = Math.round(prevSockets.bottom.x - layout.w / 2);
        finalY = Math.round(prevSockets.bottom.y);
      }
    } else if (anchorFromNext) {
      const nextSockets = getSockets(anchorFromNext.block);
      if (connectHorizontallyToNext) {
        finalX = Math.round(nextSockets.left.x - layout.w);
        finalY = Math.round(nextSockets.left.y - layout.h / 2);
      } else {
        finalX = Math.round(nextSockets.top.x - layout.w / 2);
        finalY = Math.round(nextSockets.top.y - layout.h);
      }
      nextBlockId = anchorFromNext.id;
      forceConnectToNext = true;
    }
    
    // Ensure target position is within bounds
    const maxX = boardWidth - margin - layout.w;
    finalX = Math.max(margin, Math.min(maxX, finalX));
    finalY = Math.max(margin, Math.min(finalY, canvasHeight - margin - layout.h));
    
    // Check for overlaps with existing blocks and adjust them
    // Use the layout plan to find blocks that will be in the way
    // IMPORTANT: Don't move blocks that are already correctly positioned before the mismatch
    const checkOverlap = (x: number, y: number, w: number, h: number, excludeIds: number[]): Block[] => {
      const overlapping: Block[] = [];
      for (const b of blocks) {
        if (excludeIds.includes(b.id)) continue;
        if (!isCanonicalBlockText(b.text)) continue;
        // Don't move blocks that are already correctly positioned
        if (correctBlockIdsBeforeMismatch.has(b.id)) continue;
        // Skip blocks that are already planned to be moved (they're in the layout plan)
        // But don't skip the swap block if we're swapping
        const isPlanned = layoutPlan.some(plan => plan.blockId === b.id);
        if (isPlanned && (!swapBlockId || b.id !== swapBlockId)) continue;
        
        const blockLayout = computeBlockLayout(b.text, scale);
        // Check if rectangles overlap
        if (!(x + w < b.x || b.x + blockLayout.w < x || y + h < b.y || b.y + blockLayout.h < y)) {
          overlapping.push(b);
        }
      }
      return overlapping;
    };
    
    // Check if target position overlaps with existing blocks (exclude both target and swap blocks)
    // Also exclude blocks that are already correctly positioned
    const excludeIds = [targetBlockId];
    if (swapBlockId && swapBlockId !== targetBlockId) {
      excludeIds.push(swapBlockId);
    }
    // Add all correctly positioned blocks to exclude list
    correctBlockIdsBeforeMismatch.forEach(id => excludeIds.push(id));
    const overlappingBlocks = checkOverlap(finalX, finalY, layout.w, layout.h, excludeIds);
    
    // If there are overlaps, adjust the overlapping blocks to make room
    const adjustedBlocks: { id: number; toX: number; toY: number }[] = [];
    if (overlappingBlocks.length > 0) {
      for (const overlappingBlock of overlappingBlocks) {
        const blockLayout = computeBlockLayout(overlappingBlock.text, scale);
        let newX = overlappingBlock.x;
        let newY = overlappingBlock.y;
        
        // Move overlapping blocks away from target position
        if (connectHorizontallyToPrev) {
          // If connecting horizontally, shift overlapping blocks to the right
          newX = finalX + layout.w + padding;
        } else {
          // If connecting vertically, shift overlapping blocks down
          newY = finalY + layout.h + padding;
        }
        
        // Ensure adjusted block doesn't go out of bounds
        const maxX = boardWidth - margin - blockLayout.w;
        newX = Math.max(margin, Math.min(maxX, newX));
        newY = Math.max(margin, Math.min(newY, canvasHeight - margin - blockLayout.h));
        
        adjustedBlocks.push({ id: overlappingBlock.id, toX: newX, toY: newY });
      }
    }
    
    // Find the next block that should follow this one in the sequence
    // Only connect to it if it's already in the correct position, don't move it
    if (!nextBlockId && targetIndex + 1 < canonicalLines.length && nextExpectedLine) {
      // First, prioritize blocks at the actual next position in the sequence
      // This ensures we connect to the correct block, not just any block with matching text
      const nextPositionBlockIds = lineToBlockIds.get(targetIndex + 1);
      if (nextPositionBlockIds && nextPositionBlockIds.length > 0) {
        const normalizedExpectedNext = normalizeLineText(nextExpectedLine);
        // Check if any block at the next position matches the expected text
        for (const blockId of nextPositionBlockIds) {
          const candidateBlock = blocks.find(b => b.id === blockId);
          if (candidateBlock && isCanonicalBlockText(candidateBlock.text)) {
            const normalizedCandidateText = normalizeLineText(candidateBlock.text);
            if (normalizedCandidateText === normalizedExpectedNext) {
              nextBlockId = blockId;
              break;
            }
          }
        }
      }
      
      // Fallback: if no block at the correct position matches, use text matching
      // But this should be rare - it means the next block is completely misplaced
      if (!nextBlockId) {
        nextBlockId = findBlockIdByNormalizedText(nextExpectedLine);
      }
      
      // Only connect to next block if it exists, but don't move it automatically
      // The next block should only be moved if it's causing an overlap or is in the wrong position
    }
    
    // Update connections first (they're just data, will render when blocks are aligned)
    setConnections(prev => {
      // Strip connections for both target and swap blocks if swapping
      // IMPORTANT: If blocks are connected to each other, we need to break that connection
      let updated = stripConnectionsForBlock(prev, targetBlockId);
      if (swapBlockId && swapBlockId !== targetBlockId) {
        updated = stripConnectionsForBlock(updated, swapBlockId);
        
        // Explicitly break any connection between target and swap blocks
        // This ensures they're fully disconnected before moving
        const targetConn = updated[targetBlockId] || {};
        const swapConn = updated[swapBlockId] || {};
        
        // Remove target block's connection to swap block
        const cleanedTargetConn: Partial<Record<Side, number>> = {};
        for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
          if (targetConn[side] !== swapBlockId) {
            cleanedTargetConn[side] = targetConn[side];
          }
        }
        if (Object.keys(cleanedTargetConn).length > 0) {
          updated[targetBlockId] = cleanedTargetConn;
        } else {
          delete updated[targetBlockId];
        }
        
        // Remove swap block's connection to target block
        const cleanedSwapConn: Partial<Record<Side, number>> = {};
        for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
          if (swapConn[side] !== targetBlockId) {
            cleanedSwapConn[side] = swapConn[side];
          }
        }
        if (Object.keys(cleanedSwapConn).length > 0) {
          updated[swapBlockId] = cleanedSwapConn;
        } else {
          delete updated[swapBlockId];
        }
      }
      
      // Connect previous block to moved block
      if (prevBlockId != null) {
        const cleaned = stripConnectionsForBlock(updated, prevBlockId);
        if (connectHorizontallyToPrev) {
          // Connect horizontally: previous block's right to current block's left
          cleaned[prevBlockId] = { ...(cleaned[prevBlockId] || {}), right: targetBlockId };
          cleaned[targetBlockId] = { ...(cleaned[targetBlockId] || {}), left: prevBlockId };
        } else {
          // Connect vertically: previous block's bottom to current block's top
          cleaned[prevBlockId] = { ...(cleaned[prevBlockId] || {}), bottom: targetBlockId };
          cleaned[targetBlockId] = { ...(cleaned[targetBlockId] || {}), top: prevBlockId };
        }
        updated[prevBlockId] = cleaned[prevBlockId];
        updated[targetBlockId] = cleaned[targetBlockId];
      }
      
      // Connect moved block to next block only if next block is already in the correct position
      if (nextBlockId != null) {
        const nextBlock = blocks.find(b => b.id === nextBlockId);
        if (nextBlock) {
          // Check if next block is already positioned correctly relative to our target position
          const nextLayout = computeBlockLayout(nextBlock.text, scale);
          const movedBlockAtFinalPos: Block = { ...block, x: finalX, y: finalY };
          const movedBlockSockets = getSockets(movedBlockAtFinalPos);
          
          let nextBlockCorrectlyPositioned = forceConnectToNext;
          if (!forceConnectToNext) {
          if (connectHorizontallyToNext) {
            const expectedNextX = Math.round(movedBlockSockets.right.x);
            const expectedNextY = Math.round(movedBlockSockets.right.y - nextLayout.h / 2);
            nextBlockCorrectlyPositioned = Math.abs(nextBlock.x - expectedNextX) < 50 && Math.abs(nextBlock.y - expectedNextY) < 50;
          } else {
            const expectedNextX = Math.round(movedBlockSockets.bottom.x - nextLayout.w / 2);
            const expectedNextY = Math.round(movedBlockSockets.bottom.y);
            nextBlockCorrectlyPositioned = Math.abs(nextBlock.x - expectedNextX) < 50 && Math.abs(nextBlock.y - expectedNextY) < 50;
            }
          }
          
          // Only connect if next block is already in the correct position
          if (nextBlockCorrectlyPositioned) {
            const cleaned = stripConnectionsForBlock(updated, nextBlockId);
            
            if (connectHorizontallyToNext) {
              // Connect horizontally: current block's right to next block's left
              cleaned[targetBlockId] = { ...(cleaned[targetBlockId] || {}), right: nextBlockId };
              cleaned[nextBlockId] = { ...(cleaned[nextBlockId] || {}), left: targetBlockId };
            } else {
              // Connect vertically: current block's bottom to next block's top
              cleaned[targetBlockId] = { ...(cleaned[targetBlockId] || {}), bottom: nextBlockId };
              cleaned[nextBlockId] = { ...(cleaned[nextBlockId] || {}), top: targetBlockId };
            }
            
            return cleaned;
          }
        }
      }
      
      return updated;
    });
    
    // Update blocks: move the target block and swap block if needed, plus any overlapping blocks
    const updates: { id: number; toX: number; toY: number }[] = [];
    
    // Always add the target block first - it goes to its correct position
    updates.push({ id: targetBlockId, toX: finalX, toY: finalY });
    
    // If we're swapping blocks, also move the swap block to the target block's current position
    if (swapBlockId && swapBlockId !== targetBlockId) {
      const swapBlock = blocks.find(b => b.id === swapBlockId);
      if (swapBlock && block && swapBlockFinalX !== null && swapBlockFinalY !== null) {
        // The swap block goes to where the target block currently is (creating a true swap)
        // Ensure we're actually moving it (not to the same position)
        const distance = Math.sqrt(
          Math.pow(swapBlock.x - swapBlockFinalX, 2) + 
          Math.pow(swapBlock.y - swapBlockFinalY, 2)
        );
        if (distance > 1) { // Only swap if there's actual movement needed
          updates.push({ id: swapBlockId, toX: swapBlockFinalX, toY: swapBlockFinalY });
        }
      }
    }
    
    // Add adjusted blocks to updates
    updates.push(...adjustedBlocks);
    
    // Animate the blocks to their final aligned positions
    if (updates.length > 0) {
      animateMove(updates, 200);
    }
    
    // Set final positions after animation completes to ensure they're correct
    setTimeout(() => {
      setBlocks(prev => {
        const updated = prev.map(b => {
          if (b.id === targetBlockId) {
            return { ...b, x: finalX, y: finalY };
          }
          // Update swap block if swapping - ensure it moves to target block's old position
          if (swapBlockId && b.id === swapBlockId && swapBlockFinalX !== null && swapBlockFinalY !== null) {
            return { ...b, x: swapBlockFinalX, y: swapBlockFinalY };
          }
          // Update adjusted blocks
          const adjusted = adjustedBlocks.find(adj => adj.id === b.id);
          if (adjusted) {
            return { ...b, x: adjusted.toX, y: adjusted.toY };
          }
          return b;
        });
        return updated;
      });
      
      // Verify connections are properly established by checking socket alignment
      if (prevBlockId != null) {
        // Force a re-render of connections by updating them again
        setConnections(prev => {
          const updated = { ...prev };
          if (connectHorizontallyToPrev) {
            // Connect horizontally
            updated[prevBlockId] = { ...(updated[prevBlockId] || {}), right: targetBlockId };
            updated[targetBlockId] = { ...(updated[targetBlockId] || {}), left: prevBlockId };
          } else {
            // Connect vertically
            updated[prevBlockId] = { ...(updated[prevBlockId] || {}), bottom: targetBlockId };
            updated[targetBlockId] = { ...(updated[targetBlockId] || {}), top: prevBlockId };
          }
          return updated;
        });
        playSnap();
      }
      
      // Only connect to next block if it's correctly positioned
      if (nextBlockId != null) {
        const nextBlock = blocks.find(b => b.id === nextBlockId);
        if (nextBlock) {
          const nextLayout = computeBlockLayout(nextBlock.text, scale);
          const movedBlockAtFinalPos: Block = { ...block, x: finalX, y: finalY };
          const movedBlockSockets = getSockets(movedBlockAtFinalPos);
          
          let nextBlockCorrectlyPositioned = forceConnectToNext;
          if (!forceConnectToNext) {
          if (connectHorizontallyToNext) {
            const expectedNextX = Math.round(movedBlockSockets.right.x);
            const expectedNextY = Math.round(movedBlockSockets.right.y - nextLayout.h / 2);
            nextBlockCorrectlyPositioned = Math.abs(nextBlock.x - expectedNextX) < 50 && Math.abs(nextBlock.y - expectedNextY) < 50;
          } else {
            const expectedNextX = Math.round(movedBlockSockets.bottom.x - nextLayout.w / 2);
            const expectedNextY = Math.round(movedBlockSockets.bottom.y);
            nextBlockCorrectlyPositioned = Math.abs(nextBlock.x - expectedNextX) < 50 && Math.abs(nextBlock.y - expectedNextY) < 50;
            }
          }
          
          if (nextBlockCorrectlyPositioned) {
            setConnections(prev => {
              const updated = { ...prev };
              if (connectHorizontallyToNext) {
                updated[targetBlockId] = { ...(updated[targetBlockId] || {}), right: nextBlockId };
                updated[nextBlockId] = { ...(updated[nextBlockId] || {}), left: targetBlockId };
              } else {
                updated[targetBlockId] = { ...(updated[targetBlockId] || {}), bottom: nextBlockId };
                updated[nextBlockId] = { ...(updated[nextBlockId] || {}), top: targetBlockId };
              }
              return updated;
            });
            playSnap();
          }
        }
      }
    }, 250);
    
    const highlightIds = [targetBlockId];
    if (swapBlockId && swapBlockId !== targetBlockId) highlightIds.push(swapBlockId);
    if (prevBlockId != null) highlightIds.push(prevBlockId);
    if (nextBlockId != null) highlightIds.push(nextBlockId);
    // Also highlight adjusted blocks
    adjustedBlocks.forEach(adj => highlightIds.push(adj.id));
    
    const positionNum = targetIndex + 1;
    const adjustedMsg = adjustedBlocks.length > 0 
      ? ` Adjusted ${adjustedBlocks.length} overlapping block${adjustedBlocks.length > 1 ? 's' : ''} to make room.`
      : '';
    
    let connectedMsg = '';
    if (swapBlockId && swapBlockId !== targetBlockId) {
      const swapBlock = blocks.find(b => b.id === swapBlockId);
      connectedMsg = `Swapped "${block.text}" with "${swapBlock?.text || 'block'}" at position #${positionNum}!${adjustedMsg}`;
    } else {
      // If we connected directly to a previous block, say so
      if (prevBlockId != null && prevBlock) {
        connectedMsg = nextBlockId != null
          ? `Connected "${block.text}" to the correct position between the previous and next blocks!${adjustedMsg}`
          : `Connected "${block.text}" directly to its correct position!${adjustedMsg}`;
      } else {
        connectedMsg = nextBlockId != null
          ? `Moved "${block.text}" to position #${positionNum} and connected it to the next block!${adjustedMsg}`
          : `Moved "${block.text}" to position #${positionNum}.${adjustedMsg}`;
      }
    }
    
    return {
      message: connectedMsg,
      highlight: highlightIds
    };
  }, [blocks, boardWidth, margin, padding, canvasHeight, scale, findBlockIdByNormalizedText, canonicalLines, playSnap, getSockets, connections, isCanonicalBlockText, shouldConnectHorizontally]);

  const basicHintMessage = hint || `Try to think about the order of operations. Look at the blocks and see how they connect. Start with the first block and follow the logic step by step.`;

  const handleHintClick = React.useCallback(async (level: 1 | 2 | 3) => {
    if (!showHintButton) return;
    if (level === 1 && hintUsage.basic) return;
    if (level === 2 && hintUsage.syntax) return;
    if (level === 3 && hintUsage.autoFix) return;
    const allowed = await requestHintPermission(level);
    if (!allowed) return;
    if (level === 1) {
      setHintMessages([{ id: 'hint-basic', title: 'Hint 1 • Strategy', body: basicHintMessage }]);
      setHintUsage(prev => ({ ...prev, basic: true }));
      return;
    }
    if (level === 2) {
      const result = generateSyntaxHint();
      setHintMessages([{ id: 'hint-syntax', title: 'Hint 2 • Syntax Check', body: result.message }]);
      setHintUsage(prev => ({ ...prev, syntax: true }));
      if (result.highlight.length) setHighlightIds(new Set(result.highlight));
      return;
    }
    if (level === 3) {
      try {
        const result = autoFixOneBlock();
        if (result && result.message) {
          setHintMessages([{ id: 'hint-autofix', title: 'Hint 3 • Auto-fix', body: result.message }]);
          setHintUsage(prev => ({ ...prev, autoFix: true }));
          if (result.highlight && result.highlight.length) setHighlightIds(new Set(result.highlight));
        } else {
          setHintMessages([{ id: 'hint-autofix', title: 'Hint 3 • Auto-fix', body: 'Unable to auto-fix at this time. Please try rearranging blocks manually.' }]);
          setHintUsage(prev => ({ ...prev, autoFix: true }));
        }
      } catch (error) {
        console.error('Auto-fix error:', error);
        setHintMessages([{ id: 'hint-autofix', title: 'Hint 3 • Auto-fix', body: 'An error occurred while trying to auto-fix. Please try again.' }]);
        setHintUsage(prev => ({ ...prev, autoFix: true }));
      }
    }
  }, [autoFixOneBlock, basicHintMessage, generateSyntaxHint, hintUsage.autoFix, hintUsage.basic, hintUsage.syntax, requestHintPermission, showHintButton]);

  const nextHintLevel = React.useMemo<1 | 2 | 3 | null>(() => {
    if (!hintUsage.basic) return 1;
    if (!hintUsage.syntax) return 2;
    if (!hintUsage.autoFix) return 3;
    return null;
  }, [hintUsage.basic, hintUsage.syntax, hintUsage.autoFix]);

  const hintButtonLabel = React.useMemo(() => {
    if (!nextHintLevel) return 'Hint (Max)';
    const cost = HINT_COSTS[nextHintLevel];
    if (nextHintLevel === 1 && hintLabel) return hintLabel;
    return `Hint ${nextHintLevel} (-${cost} EXP)`;
  }, [hintLabel, nextHintLevel]);

  // Function to execute code and get output
function splitPythonArgs(argString: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0
  let inString = false
  let stringChar = ''
  let isEscaped = false
  for (let i = 0; i < argString.length; i++) {
    const ch = argString[i]
    if (inString) {
      current += ch
      if (isEscaped) {
        isEscaped = false
      } else if (ch === '\\') {
        isEscaped = true
      } else if (ch === stringChar) {
        inString = false
        stringChar = ''
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      current += ch
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++
      current += ch
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1)
      current += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim().length) args.push(current.trim())
  return args
}

function stripQuotes(str: string): string {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1)
  }
  return str
}

function convertPythonExprToJs(expr: string): string {
  return expr
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!')
}

function safeEvalExpression(expr: string, context: Record<string, any>): any {
  const jsExpr = convertPythonExprToJs(expr)
  const argNames = Object.keys(context)
  const argValues = Object.values(context)
  // eslint-disable-next-line no-new-func
  const fn = new Function(...argNames, `return (${jsExpr});`)
  return fn(...argValues)
}

function resolveFString(token: string, context: Record<string, any>) {
  const quoteChar = token[1]
  const body = token.slice(2, -1) // remove leading f" and trailing quote
  let result = ''
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === '{') {
      const closeIdx = body.indexOf('}', i + 1)
      if (closeIdx === -1) {
        result += '{'
        i += 1
        continue
      }
      const expr = body.slice(i + 1, closeIdx)
      try {
        const val = safeEvalExpression(expr, context)
        result += val != null ? String(val) : 'null'
      } catch {
        result += `{${expr}}`
      }
      i = closeIdx + 1
    } else {
      result += ch
      i += 1
    }
  }
  return result
}

function evaluatePrintArgument(arg: string, context: Record<string, any>): string {
  if (!arg) return ''
  if ((arg.startsWith('f"') && arg.endsWith('"')) || (arg.startsWith("f'") && arg.endsWith("'"))) {
    return resolveFString(arg, context)
  }
  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
    return stripQuotes(arg)
  }
  try {
    const value = safeEvalExpression(arg, context)
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    return value != null ? String(value) : ''
  } catch {
    return arg
  }
}

function isCSharpInterpolatedString(value: string) {
  const trimmed = (value || '').trim()
  if (!trimmed) return false
  return trimmed.startsWith('$"') ||
    trimmed.startsWith("$'") ||
    trimmed.startsWith('@"') ||
    trimmed.startsWith("@'")
}

function evaluateCSharpExpression(expr: string, context: Record<string, any>): any {
  if (!expr) return null
  const trimmed = expr.trim()
  if (!trimmed) return null
  if (isCSharpInterpolatedString(trimmed)) {
    return null
  }

  const replaced = trimmed.replace(/[A-Za-z_]\w*/g, (token) => {
    if (Object.prototype.hasOwnProperty.call(context, token)) {
      const value = context[token]
      if (typeof value === 'string') {
        return JSON.stringify(value)
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
      }
    }
    return token
  })

  const leftoverTokens = replaced.match(/[A-Za-z_]\w*/g)
  if (leftoverTokens) {
    const invalidTokens = leftoverTokens.filter(token => token !== 'true' && token !== 'false')
    if (invalidTokens.length > 0) {
      return null
    }
  }

  const validationString = replaced
    .replace(/\btrue\b/gi, '1')
    .replace(/\bfalse\b/gi, '0')

  if (!/^[0-9+\-*/().,\s"'\\]*$/.test(validationString)) {
    return null
  }

  try {
    const result = Function(`"use strict"; return (${replaced});`)()
    return result
  } catch {
    return null
  }
}

function executeCode(code: string, lang: string): string {
    if (!code.trim()) return ''
    
    try {
      // For JavaScript
      if (lang === 'javascript' || lang === 'js') {
        const output: string[] = []
        const originalLog = console.log
        console.log = (...args: any[]) => {
          output.push(args.map(arg => {
            if (arg === null) return 'null'
            if (arg === undefined) return 'undefined'
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg, null, 2)
              } catch {
                return String(arg)
              }
            }
            return String(arg)
          }).join(' '))
        }
        try {
          const func = new Function(code)
          func()
          console.log = originalLog
          return output.length > 0 ? output.join('\n') : ''
        } catch (error: any) {
          console.log = originalLog
          return `Error: ${error.message}`
        }
      }
      
      // For Python - simulate execution
      if (lang === 'python' || lang === 'py') {
        const normalizedCode = code
          .replace(/\r/g, '')
          .replace(/ {4}(?=[a-zA-Z_])/g, '\n')
        const cleaned = normalizedCode.replace(/#.*$/gm, '')
        const outputs: string[] = []
        const context: Record<string, any> = {}
        const printQueue: string[] = []
        const lines = cleaned
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
        for (const line of lines) {
          if (line.startsWith('print')) {
            printQueue.push(line)
            continue
          }
          const assignMatch = line.match(/^([a-zA-Z_][\w]*)\s*=\s*(.+)$/)
          if (assignMatch) {
            const [, name, rhs] = assignMatch
            try {
              context[name] = safeEvalExpression(rhs, context)
            } catch {
              context[name] = rhs
            }
            continue
          }
        }
        for (const line of printQueue) {
          const inner = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'))
          const args = splitPythonArgs(inner)
          if (!args.length) continue
          const rendered = args.map(arg => evaluatePrintArgument(arg, context)).join(' ')
          outputs.push(rendered)
        }
        return outputs.join('\n')
      }
      
      // For C# - simulate Console.WriteLine output
      if (lang === 'csharp' || lang === 'c#' || lang === 'cs') {
        const outputs: string[] = []
        // Normalize code: remove carriage returns and collapse whitespace
        let normalizedCode = code.replace(/\r/g, '').trim()
        // Join lines that might be split (e.g., Console.WriteLine on one line, args on next)
        normalizedCode = normalizedCode.replace(/(\w+)\s*\n\s*\(/g, '$1(')
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/(?:int|string|double|bool|var|List<\w+>)\s+(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/(?:int|string|double|bool|var|List<\w+>)\s+(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              const rawValue = varMatch[2].trim()
              let assigned = false

              if (!isCSharpInterpolatedString(rawValue)) {
                const evaluatedValue = evaluateCSharpExpression(rawValue, context)
                if (evaluatedValue !== null && evaluatedValue !== undefined) {
                  context[varName] = evaluatedValue
                  assigned = true
                }
              }

              if (assigned) {
                return
              }

              if (rawValue.match(/^['"](.*)['"]$/)) {
                context[varName] = rawValue.slice(1, -1)
              } else if (rawValue === 'true' || rawValue === 'false') {
                context[varName] = rawValue === 'true'
              } else if (!isNaN(Number(rawValue)) && rawValue.trim() !== '') {
                context[varName] = Number(rawValue)
              } else if (rawValue.startsWith('new List')) {
                context[varName] = []
              } else {
                context[varName] = rawValue
              }
            }
          })
        }
        
        // Extract Console.WriteLine statements (handle multi-line)
        // Pattern: Console.WriteLine followed by opening paren, then content, then closing paren
        const writeLinePattern = /Console\.WriteLine\s*\(\s*([^)]+)\s*\)/g
        let match
        while ((match = writeLinePattern.exec(normalizedCode)) !== null) {
          const expr = match[1].trim()
          
          if (!isCSharpInterpolatedString(expr)) {
            const evaluatedExpr = evaluateCSharpExpression(expr, context)
            if (evaluatedExpr !== null && evaluatedExpr !== undefined) {
              outputs.push(String(evaluatedExpr))
              continue
            }
          }

          // Extract string literals
          const stringMatch = expr.match(/^['"]([^'"]+)['"]$/)
          if (stringMatch) {
            outputs.push(stringMatch[1])
            continue
          }
          
          // Handle string interpolation like $"Hello, {name}!"
          if (expr.startsWith('$"') || expr.startsWith('@"') || expr.startsWith("$'") || expr.startsWith("@'")) {
            const cleaned = expr.replace(/^[$@]?["']|["']$/g, '')
            // Replace variables in interpolated string
            let result = cleaned.replace(/\{(\w+)\}/g, (match, varName) => {
              if (context[varName] !== undefined) {
                return String(context[varName])
              }
              return match
            })
            outputs.push(result)
            continue
          }
          
          // Handle string concatenation like "Name: " + name
          if (expr.includes('+')) {
            try {
              const parts = expr.split('+').map(p => p.trim())
              let result = ''
              for (const part of parts) {
                // Check if it's a string literal
                const stringLit = part.match(/^['"]([^'"]+)['"]$/)
                if (stringLit) {
                  result += stringLit[1]
                } else {
                  // Check if it's a variable
                  const varName = part.trim()
                  if (context[varName] !== undefined) {
                    result += String(context[varName])
                  } else {
                    // Try to evaluate as expression
                    try {
                      if (varName.match(/^[\d\s+\-*/().]+$/)) {
                        result += String(Function(`"use strict"; return (${varName})`)())
                      } else {
                        result += varName
                      }
                    } catch {
                      result += varName
                    }
                  }
                }
              }
              outputs.push(result)
              continue
            } catch {
              // Fall through to other evaluation methods
            }
          }
          
          // Try to evaluate simple expressions
          try {
            if (expr.match(/^[\d\s+\-*/().]+$/)) {
              const result = Function(`"use strict"; return (${expr})`)()
              outputs.push(String(result))
            } else {
              // Try to evaluate as variable reference
              if (context[expr] !== undefined) {
                outputs.push(String(context[expr]))
              } else {
                outputs.push(expr)
              }
            }
          } catch {
            // If evaluation fails, try variable lookup
            if (context[expr] !== undefined) {
              outputs.push(String(context[expr]))
            } else {
              outputs.push(expr)
            }
          }
        }
        
        return outputs.length > 0 ? outputs.join('\n') : ''
      }
      
      // For C++ - simulate cout output
      if (lang === 'cpp' || lang === 'c++') {
        const outputs: string[] = []
        let normalizedCode = code.replace(/\r/g, '').trim()
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/(?:int|string|double|bool|float|char)\s+(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/(?:int|string|double|bool|float|char)\s+(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              let value = varMatch[2].trim()
              if (value.match(/^['"](.*)['"]$/)) {
                context[varName] = value.slice(1, -1)
              } else if (value === 'true' || value === 'false') {
                context[varName] = value === 'true'
              } else if (!isNaN(Number(value)) && value.trim() !== '') {
                context[varName] = Number(value)
              } else {
                context[varName] = value
              }
            }
          })
        }
        
        // Extract cout statements (handle << operator)
        const coutPattern = /cout\s*<<\s*([^;]+);/g
        let match
        while ((match = coutPattern.exec(normalizedCode)) !== null) {
          const expr = match[1].trim()
          // Split by << to handle multiple outputs
          const parts = expr.split('<<').map(p => p.trim())
          let result = ''
          for (const part of parts) {
            // Check for string literals
            const stringMatch = part.match(/^['"]([^'"]+)['"]$/)
            if (stringMatch) {
              result += stringMatch[1]
            } else if (part === 'endl' || part === 'std::endl') {
              // Skip endl, it's just a newline
              continue
            } else {
              // Check if it's a variable
              const varName = part.replace(/std::/g, '').trim()
              if (context[varName] !== undefined) {
                result += String(context[varName])
              } else {
                result += part
              }
            }
          }
          if (result) outputs.push(result)
        }
        
        return outputs.length > 0 ? outputs.join('\n') : ''
      }
      
      // For Java - simulate System.out.println output
      if (lang === 'java') {
        const outputs: string[] = []
        let normalizedCode = code.replace(/\r/g, '').trim()
        normalizedCode = normalizedCode.replace(/(\w+)\s*\n\s*\(/g, '$1(')
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/(?:int|String|double|boolean|float|char)\s+(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/(?:int|String|double|boolean|float|char)\s+(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              let value = varMatch[2].trim()
              if (value.match(/^['"](.*)['"]$/)) {
                context[varName] = value.slice(1, -1)
              } else if (value === 'true' || value === 'false') {
                context[varName] = value === 'true'
              } else if (!isNaN(Number(value)) && value.trim() !== '') {
                context[varName] = Number(value)
              } else {
                context[varName] = value
              }
            }
          })
        }
        
        // Extract System.out.println statements
        const printlnPattern = /System\.out\.println\s*\(\s*([^)]+)\s*\)/g
        let match
        while ((match = printlnPattern.exec(normalizedCode)) !== null) {
          const expr = match[1].trim()
          
          // Extract string literals
          const stringMatch = expr.match(/^['"]([^'"]+)['"]$/)
          if (stringMatch) {
            outputs.push(stringMatch[1])
            continue
          }
          
          // Handle string concatenation like "Name: " + name
          if (expr.includes('+')) {
            try {
              const parts = expr.split('+').map(p => p.trim())
              let result = ''
              for (const part of parts) {
                const stringLit = part.match(/^['"]([^'"]+)['"]$/)
                if (stringLit) {
                  result += stringLit[1]
                } else {
                  const varName = part.trim()
                  if (context[varName] !== undefined) {
                    result += String(context[varName])
                  } else {
                    try {
                      if (varName.match(/^[\d\s+\-*/().]+$/)) {
                        result += String(Function(`"use strict"; return (${varName})`)())
                      } else {
                        result += varName
                      }
                    } catch {
                      result += varName
                    }
                  }
                }
              }
              outputs.push(result)
              continue
            } catch {
              // Fall through
            }
          }
          
          // Try variable lookup or expression
          try {
            if (expr.match(/^[\d\s+\-*/().]+$/)) {
              const result = Function(`"use strict"; return (${expr})`)()
              outputs.push(String(result))
            } else if (context[expr] !== undefined) {
              outputs.push(String(context[expr]))
            } else {
              outputs.push(expr)
            }
          } catch {
            if (context[expr] !== undefined) {
              outputs.push(String(context[expr]))
            } else {
              outputs.push(expr)
            }
          }
        }
        
        return outputs.length > 0 ? outputs.join('\n') : ''
      }
      
      // For PHP - simulate echo/print output
      if (lang === 'php') {
        const outputs: string[] = []
        let normalizedCode = code.replace(/\r/g, '').trim()
        // Remove PHP tags
        normalizedCode = normalizedCode.replace(/^<\?php\s*|\s*\?>$/g, '')
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/\$(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/\$(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              let value = varMatch[2].trim()
              if (value.match(/^['"](.*)['"]$/)) {
                context[varName] = value.slice(1, -1)
              } else if (value === 'true' || value === 'false') {
                context[varName] = value === 'true'
              } else if (!isNaN(Number(value)) && value.trim() !== '') {
                context[varName] = Number(value)
              } else {
                context[varName] = value
              }
            }
          })
        }
        
        // Extract echo/print statements
        const echoPattern = /(?:echo|print)\s+([^;]+);/g
        let match
        while ((match = echoPattern.exec(normalizedCode)) !== null) {
          const expr = match[1].trim()
          
          // Extract string literals
          const stringMatch = expr.match(/^['"]([^'"]+)['"]$/)
          if (stringMatch) {
            outputs.push(stringMatch[1])
            continue
          }
          
          // Handle string concatenation with . operator
          if (expr.includes('.')) {
            try {
              const parts = expr.split('.').map(p => p.trim().replace(/^['"]|['"]$/g, ''))
              let result = ''
              for (const part of parts) {
                // Check if it's a variable (starts with $)
                if (part.startsWith('$')) {
                  const varName = part.slice(1)
                  if (context[varName] !== undefined) {
                    result += String(context[varName])
                  } else {
                    result += part
                  }
                } else {
                  result += part
                }
              }
              outputs.push(result)
              continue
            } catch {
              // Fall through
            }
          }
          
          // Handle variable reference
          if (expr.startsWith('$')) {
            const varName = expr.slice(1)
            if (context[varName] !== undefined) {
              outputs.push(String(context[varName]))
            } else {
              outputs.push(expr)
            }
          } else {
            outputs.push(expr)
          }
        }
        
        return outputs.length > 0 ? outputs.join('\n') : ''
      }
      
      return ''
    } catch (error: any) {
      return `Error: ${error.message}`
    }
  }

  // Live preview: update Output automatically when blocks or connections change
  React.useEffect(() => {
    const hasConnections = Object.values(connections).some(entry =>
      entry && (entry.top != null || entry.bottom != null || entry.left != null || entry.right != null)
    );

    if (!hasConnections) {
      setOutputText('// Program output will appear here...');
      setLivePreviewOutput('');
      return;
    }

    const program = computeProgramText();
    setOutputText(program || '// Program output will appear here...');
    if (program && program.trim().length) {
      setLivePreviewOutput(executeCode(program, language) || '');
    } else {
      setLivePreviewOutput('');
    }
  }, [blocks, connections, language]);

  // Validate: one single chain using bottom links in correct order (1..n)
  function submitSolution() {
    const programText = computeProgramText();
    const normalizedActual = normalizeProgramString(programText);
    const runtimeOutput = programText.trim().length ? executeCode(programText, language) : '';
    setActualOutput(runtimeOutput);

    if (!normalizedActual.length) {
      setResultStatus('error');
      setResultDetails('No blocks submitted yet. Connect the puzzle pieces from top to bottom before trying again.');
      onSubmitResult?.('error', programText); // Pass the code even if empty
      return;
    }

    const logicalIssue = detectProgramIssues(normalizedActual, language);
    if (logicalIssue) {
      setResultStatus('error');
      setResultDetails(logicalIssue);
      setIsOutputMinimized(false);
      onSubmitResult?.('error', programText);
      return;
    }

    // Normalize expected lines accounting for horizontal connections
    // This matches how computeProgramText() combines horizontally connected blocks
    const shouldConnectHorizontally = (currentText: string, nextText: string | null): boolean => {
      if (!nextText) return false
      const current = currentText.trim()
      const next = nextText.trim()
      if (current.match(/^[a-zA-Z_][\w]*\s*$/) && next.startsWith('(')) return true
      if (current.match(/^[a-zA-Z_][\w]*\.\w+\s*$/) && next.startsWith('(')) return true
      if (current.endsWith('(') && (next.startsWith('"') || next.startsWith("'") || next.startsWith('$"'))) return true
      if (current.endsWith(')') && next === ';') return true
      if (current.endsWith('}') && next === ';') return true
      if (current.endsWith(']') && next === ';') return true
      if (current.match(/^(var|int|string|double|bool|float|char)\s+\w+\s*$/) && next.startsWith('=')) return true
      if (current.match(/^[\w"']+\s*$/) && next.match(/^[+\-*/=<>!]+\s*/)) return true
      if (current.match(/^[\w"')]+\s*$/) && next === ';') return true
      return false
    }

    // Build normalized expected lines accounting for horizontal connections
    // This matches how computeProgramText() combines horizontally connected blocks
    const normalizedExpected: string[] = [];
    let i = 0;
    while (i < canonicalLines.length) {
      let combinedLine = canonicalLines[i];
      let j = i + 1;
      
      // Combine consecutive lines that should connect horizontally
      while (j < canonicalLines.length && shouldConnectHorizontally(canonicalLines[j - 1], canonicalLines[j])) {
        combinedLine = normalizeLineText(combinedLine + canonicalLines[j]);
        j++;
      }
      
      normalizedExpected.push(normalizeLineText(combinedLine));
      i = j; // Move to the next unprocessed line
    }

    const hasSameLength = normalizedActual.length === normalizedExpected.length;
    let mismatchMessage: string | null = null;
    const longest = Math.max(normalizedActual.length, normalizedExpected.length);
    for (let idx = 0; idx < longest; idx++) {
      const expectedLine = normalizedExpected[idx];
      const actualLine = normalizedActual[idx];
      if (expectedLine && !actualLine) {
        mismatchMessage = `Syntax Error: block #${idx + 1} is missing.`;
        break;
      }
      if (!expectedLine && actualLine) {
        mismatchMessage = `Syntax Error: unexpected block #${idx + 1}.`;
        break;
      }
      if (expectedLine !== actualLine) {
        mismatchMessage = `Syntax Error: block #${idx + 1} is in the wrong position.`;
        break;
      }
    }
    const isMatch = !mismatchMessage && hasSameLength;
    
    if (isMatch) {
      // Execute code to get actual output
      setExpectedOutput(runtimeOutput); // Expected output is the same as actual when successful
      setResultStatus('success');
      setResultDetails('Looks great! All required blocks are in the correct order.');
      setIsOutputMinimized(true); // Minimize output section on success
      
      // Show congratulations popup only if not the last level
      // Last level completion is handled by parent component
      if (!isLastLevel) {
        setShowCongratulations(true);
        
        // Auto-advance after 3 seconds
        setTimeout(() => {
          setShowCongratulations(false);
          onSubmitResult?.('success', programText); // Pass the code to the callback
        }, 3000);
      } else {
        // For last level, just pass success without showing popup
        // Parent will handle lesson completion popup
        // Play sound for last level completion too
        playLevelCompleteSound();
        onSubmitResult?.('success', programText);
      }
    } else {
      setExpectedOutput('');
      const errorMessage = mismatchMessage
        ? mismatchMessage
        : `Syntax Error: expected ${normalizedExpected.length} blocks but got ${normalizedActual.length}.`;
      setResultDetails(errorMessage);
      setResultStatus('error');
      setIsOutputMinimized(false);
      onSubmitResult?.('error', programText); // Pass the code even on error
    }
  }

  function resetBoard() {
    // Set flag to prevent useEffect from interfering during reset
    isResettingRef.current = true
    
    // Notify parent component that reset was clicked
    onReset?.()
    
    if (initialTexts && initialTexts.length) {
      // Create a function that builds blocks with randomized positions
      const buildBlocksWithRandomPositions = (texts: string[]): { blocks: Block[]; canvasHeight: number } => {
        const extrasTarget = Math.max(0, randomExtras?.count ?? 0)
        const sanitizedBase = texts.filter(text => text && text.trim().length > 0)
        const configuredPool = (randomExtras?.pool && randomExtras.pool.length ? randomExtras.pool : defaultExtraPool)
          .filter(item => item && item.trim().length > 0 && !sanitizedBase.includes(item))
        const pool = sanitizedBase.slice()

        if (extrasTarget > 0) {
          const used = new Set(pool)
          let added = 0
          let attempts = 0
          const extraAttempts = Math.max(32, extrasTarget * Math.max(configuredPool.length, 1) * 4)
          while (added < extrasTarget && attempts < extraAttempts) {
            attempts += 1
            const candidateSource = configuredPool.length ? configuredPool : defaultExtraPool
            const candidate = candidateSource[Math.floor(Math.random() * candidateSource.length)]
            if (!candidate || used.has(candidate) || candidate.trim().length === 0) continue
            pool.push(candidate)
            used.add(candidate)
            added += 1
          }
          while (added < extrasTarget) {
            const filler = `extra_block_${added + 1} = None`
            if (!used.has(filler)) {
              pool.push(filler)
              used.add(filler)
              added += 1
            } else {
              break
            }
          }
        }

        const uniquePool = pool.filter(text => text && text.trim().length > 0)
        const palette = generateColorPalette(uniquePool, uniquePool.length)

        const layoutInfos = uniquePool.map((text, idx) => ({
          id: idx + 1,
          text,
          color: (palette[idx % palette.length]) || fallbackPalette[idx % fallbackPalette.length],
          layout: computeBlockLayout(text, scale)
        }))

        if (!layoutInfos.length) {
          return { blocks: [], canvasHeight: height }
        }

        const rectanglesOverlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => {
          return !(
            ax + aw + padding <= bx ||
            ax >= bx + bw + padding ||
            ay + ah + padding <= by ||
            ay >= by + bh + padding
          )
        }

        // Use a truly random seed based on current time to ensure different positions each reset
        const randomSeed = Math.floor(Math.random() * 0x7fffffff) + Date.now()
        const mulberry32 = (seed: number) => () => {
          let t = (seed += 0x6d2b79f5)
          t = Math.imul(t ^ (t >>> 15), t | 1)
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }

        const tryRandomPlacement = (): Placement[] | null => {
          const placements: Placement[] = []
          // Shuffle the order of blocks to randomize placement order
          const shuffled = [...layoutInfos].sort(() => Math.random() - 0.5)
          
          for (let idx = 0; idx < shuffled.length; idx++) {
            const info = shuffled[idx]
            // Use a different seed for each block that includes randomness from the reset
            // Add random component that changes on each reset
            const blockRandomOffset = Math.floor(Math.random() * 1000000)
            const rand = mulberry32(randomSeed + idx * 997 + info.text.length * 31 + blockRandomOffset)
            // Ensure blocks don't extend beyond boardWidth (account for block width and jigsaw tabs)
            const tabSize = 14 * scale
            const padding = 20 // Same padding as constrainPosition
            const spanW = Math.max(0, boardWidth - padding * 2 - info.layout.w - tabSize)
            const spanH = Math.max(0, height - padding * 2 - info.layout.h - tabSize)
            let placedSuccessfully = false
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              const candidateX = Math.round(padding + rand() * spanW)
              const candidateY = Math.round(padding + rand() * spanH)
              // Ensure block doesn't extend beyond boardWidth (account for tabs)
              const maxX = boardWidth - padding - info.layout.w - tabSize
              const constrainedX = Math.max(padding, Math.min(maxX, candidateX))
              const overlaps = placements.some(existing => rectanglesOverlap(constrainedX, candidateY, info.layout.w, info.layout.h, existing.x, existing.y, existing.layout.w, existing.layout.h))
              if (!overlaps) {
                placements.push({ id: info.id, text: info.text, color: info.color, x: constrainedX, y: candidateY, layout: info.layout })
                placedSuccessfully = true
                break
              }
            }
            if (!placedSuccessfully) {
              return null
            }
          }
          return placements
        }

        const randomPlacements = tryRandomPlacement()
        if (randomPlacements) {
          return {
            blocks: randomPlacements.map(({ layout, ...rest }) => rest),
            canvasHeight: calculateCanvasHeight(randomPlacements)
          }
        }

        // Fallback: use grid layout but with random offset
        const buildFallbackPlacements = (): Placement[] => {
          const maxWidth = layoutInfos.reduce((max, info) => Math.max(max, info.layout.w), 0)
          const maxHeight = layoutInfos.reduce((max, info) => Math.max(max, info.layout.h), 0)

          if (!maxWidth || !maxHeight) {
            return layoutInfos.map(info => ({ id: info.id, text: info.text, color: info.color, x: margin, y: margin, layout: info.layout }))
          }

          let columns = Math.max(1, Math.floor((boardWidth - margin * 2 + padding) / (maxWidth + padding)))
          columns = Math.max(1, Math.min(columns, layoutInfos.length))

          if (columns > 1) {
            const maxSpan = boardWidth - margin * 2 - maxWidth
            if (maxSpan <= 0) {
              columns = 1
            } else {
              while (columns > 1) {
                const step = maxSpan / (columns - 1)
                if (step >= maxWidth + 8) break
                columns -= 1
              }
            }
          }

          const maxSpan = boardWidth - margin * 2 - maxWidth
          const step = columns > 1 ? maxSpan / Math.max(1, columns - 1) : 0
          const columnStep = columns > 1 ? Math.max(maxWidth + 8, Math.min(maxWidth + padding, step)) : 0
          const rowStep = maxHeight + padding

          // Shuffle blocks before placing in grid
          const shuffled = [...layoutInfos].sort(() => Math.random() - 0.5)
          const placements: Placement[] = []
          shuffled.forEach((info, idx) => {
            const col = columns > 0 ? idx % columns : 0
            const row = columns > 0 ? Math.floor(idx / columns) : idx
            // Add small random offset to break grid pattern
            const offsetX = Math.random() * 20 - 10
            const offsetY = Math.random() * 20 - 10
            let x = Math.round(margin + col * columnStep + offsetX)
            const y = Math.round(margin + row * rowStep + offsetY)
            // Ensure block doesn't extend beyond boardWidth
            const maxX = boardWidth - margin - info.layout.w
            x = Math.max(margin, Math.min(maxX, x))
            placements.push({ id: info.id, text: info.text, color: info.color, x, y, layout: info.layout })
          })
          return placements
        }

        const fallbackPlacements = buildFallbackPlacements()
        return {
          blocks: fallbackPlacements.map(({ layout, ...rest }) => rest),
          canvasHeight: calculateCanvasHeight(fallbackPlacements)
        }
      }

      const { blocks: newBlocks, canvasHeight: newHeight } = buildBlocksWithRandomPositions(initialTexts)
      setBlocks(newBlocks)
      setCanvasHeight(newHeight)

      const p: Record<number, PatternSides> = {}
      const baseCount = initialTexts.length
      
      // Difficulty-based shape probabilities
      const difficultyConfig = {
        Easy: { rightTabProb: 0.3, leftTabProb: 0.3 },
        Medium: { rightTabProb: 0.5, leftTabProb: 0.4 },
        Hard: { rightTabProb: 0.7, leftTabProb: 0.5 }
      }
      const config = difficultyConfig[difficulty] || difficultyConfig.Easy
      const langForPatterns = (language || 'python').toLowerCase()
      const effectiveConfig = langForPatterns === 'python'
        ? { rightTabProb: 0, leftTabProb: 0 }
        : config
      
      // Use level number and difficulty to seed randomness for consistent but varied patterns per level
      const levelSeed = currentLevel * 1000 + (difficulty === 'Easy' ? 1 : difficulty === 'Medium' ? 2 : 3)
      const rand = (seedA: number, seedB: number) => {
        let x = Math.imul(seedA ^ 0x9e3779b1, 0x85ebca6b) ^ (seedB + levelSeed)
        x ^= x >>> 15; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2f); x ^= x >>> 16
        return (x >>> 0) / 0xffffffff
      }
      
      // Check if a block should connect to the previous one (for semicolons, etc.)
      const shouldConnectToPrevious = (currentText: string, prevText: string | null): boolean => {
        if (!prevText) return false
        
        const current = currentText.trim()
        const prev = prevText.trim()
        
        // Semicolon should connect to previous statement
        if (current === ';' && prev.length > 0 && !prev.endsWith(';')) return true
        
        // Opening parenthesis should connect to function/method name
        if (current.startsWith('(') && prev.match(/^[a-zA-Z_][\w]*\.?\w*\s*$/)) return true
        
        // String literals should connect to opening parenthesis
        if ((current.startsWith('"') || current.startsWith("'") || current.startsWith('$"')) && prev.endsWith('(')) return true
        
        return false
      }
      
      // First pass: determine which blocks should connect horizontally
      const horizontalConnections: Record<number, { right?: boolean; left?: boolean }> = {}
      for (let i = 0; i < baseCount; i++) {
        const id = i + 1
        const currentText = initialTexts[i]
        const nextText = i < baseCount - 1 ? initialTexts[i + 1] : null
        const prevText = i > 0 ? initialTexts[i - 1] : null
        
        horizontalConnections[id] = {}
        
        if (shouldConnectHorizontally(currentText, nextText)) {
          horizontalConnections[id].right = true
        }
        if (shouldConnectToPrevious(currentText, prevText)) {
          horizontalConnections[id].left = true
          // Mark previous block should have right tab
          if (i > 0) {
            const prevId = i
            horizontalConnections[prevId] = horizontalConnections[prevId] || {}
            horizontalConnections[prevId].right = true
          }
        }
      }
      
      // Second pass: assign shapes based on connections
      for (let i = 0; i < newBlocks.length; i++) {
        const id = i + 1
        if (i < baseCount) {
          const topShape: any = i === 0 ? 'flat' : 'slot'
          const bottomShape: any = i === baseCount - 1 ? 'flat' : 'tab'
          
          const connections = horizontalConnections[id] || {}
          
          // Assign horizontal shapes based on connections
          const rightShape: any = connections.right
            ? 'tab'
            : ((rand(id, 29) < effectiveConfig.rightTabProb) ? 'tab' : 'slot')
          const leftShape: any = connections.left
            ? 'slot'
            : ((rand(id, 17) < effectiveConfig.leftTabProb) ? 'tab' : 'slot')
          
          // Ensure compatibility: if previous block has right tab, this should have left slot
          let finalLeftShape = leftShape
          if (i > 0) {
            const prevId = i
            const prevConnections = horizontalConnections[prevId] || {}
            if (prevConnections.right) {
              finalLeftShape = 'slot'
            }
          }
          
          p[id] = { top: topShape, right: rightShape, bottom: bottomShape, left: finalLeftShape }
        } else {
          p[id] = { top: false, right: false, bottom: false, left: false }
        }
      }
      setPatternsById(p)
    } else {
      // No initialTexts - reset to empty (should not happen when database lessons exist)
      console.warn('⚠️ No initialTexts in resetBoard - resetting to empty blocks')
      setBlocks([])
      setCanvasHeight(height)
      setPatternsById({})
    }

    setConnections({})
    setSnapPreview(null)
    setHighlightIds(new Set())
    setOutputText('// Program output will appear here...')
    setResultStatus('pending')
    setResultDetails(DEFAULT_RESULT_MESSAGE)
    setExpectedOutput('')
    setActualOutput('')
    setLivePreviewOutput('')
    setIsOutputMinimized(false)
    setShowCongratulations(false)
    setHintMessages([])
    setHintUsage({ basic: false, syntax: false, autoFix: false })
    
    // Clear the reset flag after a brief delay to ensure state updates are processed
    // This prevents the useEffect from interfering with the reset
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isResettingRef.current = false
      })
    })
  }

  return (
    <>
      {/* Congratulations Popup - Character Centered Design */}
      {showCongratulations && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 12000,
          animation: 'fadeIn 0.5s ease-in',
          overflow: 'hidden'
        }}>
          {/* Confetti Container */}
          <div className="confetti-container" style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            overflow: 'hidden'
          }}>
            {Array.from({ length: 80 }).map((_, i) => (
              <div
                key={i}
                className="confetti"
                style={{
                  position: 'absolute',
                  width: `${Math.random() * 12 + 6}px`,
                  height: `${Math.random() * 12 + 6}px`,
                  backgroundColor: ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#ff9ff3', '#54a0ff'][Math.floor(Math.random() * 10)],
                  left: `${Math.random() * 100}%`,
                  top: '-10px',
                  animation: `confettiFall ${Math.random() * 3 + 2}s linear forwards`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  borderRadius: Math.random() > 0.5 ? '50%' : '0%',
                  transform: `rotate(${Math.random() * 360}deg)`
                }}
              />
            ))}
          </div>

          {/* Main Character Container - No Box Background */}
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            animation: 'characterEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 1
          }}>
            {/* Robot Character Container */}
            <div style={{
              position: 'relative',
              display: 'inline-block',
              animation: 'robotCelebrate 2.5s ease-in-out infinite',
              marginBottom: 40
            }}>
              {/* Robot Character Design - Enhanced with mechanical animations */}
              <div style={{
                position: 'relative',
                fontSize: 200,
                lineHeight: 1,
                filter: 'drop-shadow(0 15px 30px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 50px rgba(102, 126, 234, 0.6))',
                animation: 'robotBounce 2s ease-in-out infinite',
                transformOrigin: 'center bottom'
              }}>
                {/* Robot with mechanical movement */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{ 
                    display: 'inline-block',
                    animation: 'robotRotate 4s ease-in-out infinite',
                    transformOrigin: 'center',
                    filter: 'drop-shadow(0 0 20px rgba(34, 225, 255, 0.8))'
                  }}>🤖</span>
                  {/* Robot eye glow effect */}
                  <span style={{
                    position: 'absolute',
                    top: '25%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(34, 225, 255, 0.9) 0%, rgba(34, 225, 255, 0.3) 50%, transparent 100%)',
                    animation: 'robotEyeGlow 1.5s ease-in-out infinite',
                    pointerEvents: 'none'
                  }} />
                </div>
              </div>
              
              {/* Celebration effects around robot */}
              <span style={{
                position: 'absolute',
                top: '-20px',
                right: '-30px',
                fontSize: 60,
                animation: 'sparkle 1s ease-in-out infinite',
                animationDelay: '0.2s',
                zIndex: 10
              }}>✨</span>
              <span style={{
                position: 'absolute',
                top: '-10px',
                left: '-30px',
                fontSize: 50,
                animation: 'sparkle 1s ease-in-out infinite',
                animationDelay: '0.4s',
                zIndex: 10
              }}>⭐</span>
              <span style={{
                position: 'absolute',
                bottom: '-20px',
                right: '-20px',
                fontSize: 55,
                animation: 'sparkle 1s ease-in-out infinite',
                animationDelay: '0.6s',
                zIndex: 10
              }}>🎉</span>
              <span style={{
                position: 'absolute',
                bottom: '-10px',
                left: '-20px',
                fontSize: 50,
                animation: 'sparkle 1s ease-in-out infinite',
                animationDelay: '0.8s',
                zIndex: 10
              }}>🏆</span>
              
              {/* Orbiting Stars around robot */}
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    fontSize: 40,
                    top: '50%',
                    left: '50%',
                    transform: `translate(-50%, -50%) rotate(${i * 22.5}deg) translateY(-150px)`,
                    animation: `starOrbit ${3 + i * 0.15}s ease-in-out infinite`,
                    animationDelay: `${i * 0.08}s`,
                    opacity: 0.9,
                    filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.9))',
                    zIndex: 5
                  }}
                >
                  ⭐
                </div>
              ))}
            </div>

            {/* Speech Bubble - Larger and more prominent */}
            <div style={{
              position: 'relative',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              color: '#1a1a1a',
              padding: '24px 36px',
              borderRadius: 28,
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.3)',
              fontSize: 28,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              animation: 'speechBubblePop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s both',
              marginBottom: 50,
              minWidth: '280px',
              border: '3px solid rgba(102, 126, 234, 0.3)'
            }}>
              <div style={{
                position: 'absolute',
                bottom: '-18px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '18px solid transparent',
                borderRight: '18px solid transparent',
                borderTop: '18px solid #ffffff',
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))'
              }} />
              <span style={{ 
                animation: 'textWave 0.6s ease-in-out 1s both',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                Congratulations! 🎉
              </span>
            </div>

            {/* Success Message - Floating text */}
            <div style={{
              position: 'relative',
              zIndex: 1,
              animation: 'slideInUp 0.8s ease-out 0.6s both'
            }}>
              <h2 style={{
                fontSize: 48,
                fontWeight: 800,
                color: 'white',
                margin: '0 0 16px 0',
                textShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 30px rgba(102, 126, 234, 0.6)',
                letterSpacing: '1px'
              }}>
                Level {currentLevel} Complete!
              </h2>
              <p style={{
                fontSize: 22,
                color: 'rgba(255, 255, 255, 0.95)',
                margin: '0 0 0 0',
                fontWeight: 500,
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.4)'
              }}>
                Amazing work! Keep it up! 💪
              </p>
            </div>

            {/* Countdown Message - Only show if not last level */}
            <div style={{
              fontSize: 16,
              color: 'rgba(255, 255, 255, 0.85)',
              marginTop: 40,
              padding: '14px 28px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              animation: 'fadeInUp 0.8s ease-out 0.8s both',
              position: 'relative',
              zIndex: 1
            }}>
              <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
                Proceeding to next level in 3 seconds...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Achievement Notifications - Lower Left Corner */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: 'flex-start',
        pointerEvents: 'none'
      }}>
        {achievementNotifications.map((notification, index) => (
          <div
            key={notification.id}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
              color: 'white',
              padding: '18px 22px',
              borderRadius: '18px',
              boxShadow: '0 10px 40px rgba(102, 126, 234, 0.7), 0 0 0 3px rgba(255, 255, 255, 0.3), 0 0 60px rgba(102, 126, 234, 0.4)',
              minWidth: '300px',
              maxWidth: '380px',
              animation: 'achievementSlideInLeft 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
              pointerEvents: 'auto',
              position: 'relative',
              overflow: 'hidden',
              border: '2px solid rgba(255, 255, 255, 0.4)'
            }}
          >
            {/* Animated background glow */}
            <div style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%)',
              animation: 'achievementGlowRotate 3s linear infinite',
              pointerEvents: 'none'
            }} />
            
            {/* Sparkle particles */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: '4px',
                  height: '4px',
                  background: 'white',
                  borderRadius: '50%',
                  top: `${20 + Math.random() * 60}%`,
                  left: `${20 + Math.random() * 60}%`,
                  animation: `achievementSparkle ${1.5 + Math.random()}s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                  boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)'
                }}
              />
            ))}
            
            {/* Main content container */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              position: 'relative',
              zIndex: 2
            }}>
              {/* Icon with enhanced effects */}
              <div style={{
                fontSize: '48px',
                lineHeight: 1,
                animation: 'achievementIconBounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both',
                filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4)) drop-shadow(0 0 20px rgba(255, 255, 255, 0.6))',
                position: 'relative',
                transformStyle: 'preserve-3d'
              }}>
                {/* Icon glow ring */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.3), transparent 70%)',
                  animation: 'achievementIconPulse 2s ease-in-out infinite',
                  zIndex: -1
                }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  {notification.icon || '🏆'}
                </div>
              </div>
              
              {/* Content */}
              <div style={{ flex: 1, position: 'relative', zIndex: 2 }}>
                <div style={{
                  fontSize: '17px',
                  fontWeight: 800,
                  marginBottom: '6px',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 255, 255, 0.3)',
                  letterSpacing: '0.5px',
                  animation: 'achievementTitlePop 0.5s ease-out 0.3s both'
                }}>
                  {notification.title}
                </div>
                <div style={{
                  fontSize: '13px',
                  opacity: 0.95,
                  lineHeight: 1.5,
                  textShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
                  animation: 'achievementDescFade 0.6s ease-out 0.4s both'
                }}>
                  {notification.description}
                </div>
                {notification.expReward && notification.expReward > 0 && (
                  <div style={{
                    fontSize: '13px',
                    marginTop: '8px',
                    padding: '6px 12px',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.15))',
                    borderRadius: '10px',
                    display: 'inline-block',
                    fontWeight: 700,
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                    animation: 'achievementExpPop 0.5s ease-out 0.5s both'
                  }}>
                    +{notification.expReward} EXP ⚡
                  </div>
                )}
              </div>
            </div>
            
            {/* Animated progress bar for auto-dismiss */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '0 0 18px 18px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.6))',
                width: '100%',
                animation: 'achievementProgress 5s linear forwards',
                transformOrigin: 'left',
                boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
              }} />
            </div>
            
            {/* Shine effect sweep */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '-100%',
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
              animation: 'achievementShine 3s ease-in-out infinite',
              animationDelay: '0.5s'
            }} />
          </div>
        ))}
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleInBounce {
          0% { 
            transform: scale(0.3) rotate(-10deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.05) rotate(2deg);
          }
          70% {
            transform: scale(0.95) rotate(-1deg);
          }
          100% { 
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes bounceCelebrate {
          0%, 100% { 
            transform: translateY(0) scale(1) rotate(0deg);
          }
          25% {
            transform: translateY(-15px) scale(1.1) rotate(-5deg);
          }
          50% {
            transform: translateY(-25px) scale(1.15) rotate(5deg);
          }
          75% {
            transform: translateY(-10px) scale(1.05) rotate(-2deg);
          }
        }
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
        @keyframes shimmer {
          0% {
            left: -100%;
          }
          100% {
            left: 100%;
          }
        }
        @keyframes pulseGlow {
          0%, 100% {
            opacity: 0.3;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1.1);
          }
        }
        @keyframes confettiFall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes characterEntrance {
          0% {
            transform: scale(0) rotate(-180deg);
            opacity: 0;
          }
          60% {
            transform: scale(1.2) rotate(10deg);
          }
          80% {
            transform: scale(0.95) rotate(-5deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes characterCelebrate {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          25% {
            transform: translateY(-10px) rotate(-5deg);
          }
          50% {
            transform: translateY(-15px) rotate(5deg);
          }
          75% {
            transform: translateY(-8px) rotate(-3deg);
          }
        }
        @keyframes characterBounce {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-8px) scale(1.05);
          }
        }
        @keyframes starOrbit {
          0% {
            transform: translate(-50%, -50%) rotate(0deg) translateY(-120px) rotate(0deg);
            opacity: 0;
            scale: 0;
          }
          30% {
            opacity: 1;
            scale: 1;
          }
          70% {
            opacity: 1;
            scale: 1;
          }
          100% {
            transform: translate(-50%, -50%) rotate(360deg) translateY(-120px) rotate(-360deg);
            opacity: 0.7;
            scale: 0.8;
          }
        }
        @keyframes characterRotate {
          0%, 100% {
            transform: rotate(0deg) scale(1);
          }
          25% {
            transform: rotate(-5deg) scale(1.05);
          }
          50% {
            transform: rotate(0deg) scale(1.1);
          }
          75% {
            transform: rotate(5deg) scale(1.05);
          }
        }
        @keyframes robotRotate {
          0%, 100% {
            transform: rotate(0deg) scale(1);
          }
          20% {
            transform: rotate(-8deg) scale(1.08);
          }
          40% {
            transform: rotate(0deg) scale(1.12);
          }
          60% {
            transform: rotate(8deg) scale(1.08);
          }
          80% {
            transform: rotate(0deg) scale(1.05);
          }
        }
        @keyframes robotBounce {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          25% {
            transform: translateY(-12px) scale(1.06);
          }
          50% {
            transform: translateY(-20px) scale(1.1);
          }
          75% {
            transform: translateY(-8px) scale(1.04);
          }
        }
        @keyframes robotEyeGlow {
          0%, 100% {
            opacity: 0.6;
            transform: translateX(-50%) scale(1);
          }
          50% {
            opacity: 1;
            transform: translateX(-50%) scale(1.3);
          }
        }
        @keyframes robotCelebrate {
          0%, 100% {
            transform: translateY(0) rotate(0deg) scale(1);
          }
          20% {
            transform: translateY(-12px) rotate(-6deg) scale(1.08);
          }
          40% {
            transform: translateY(-18px) rotate(6deg) scale(1.12);
          }
          60% {
            transform: translateY(-10px) rotate(-4deg) scale(1.06);
          }
          80% {
            transform: translateY(-5px) rotate(2deg) scale(1.03);
          }
        }
        @keyframes person3DRotate {
          0%, 100% {
            transform: rotateY(0deg) rotateX(0deg);
          }
          25% {
            transform: rotateY(10deg) rotateX(2deg);
          }
          50% {
            transform: rotateY(0deg) rotateX(0deg);
          }
          75% {
            transform: rotateY(-10deg) rotateX(-2deg);
          }
        }
        @keyframes headBob {
          0%, 100% {
            transform: translateX(-50%) translateY(0px);
          }
          50% {
            transform: translateX(-50%) translateY(-8px);
          }
        }
        @keyframes armSwing {
          0%, 100% {
            transform: rotate(-15deg);
          }
          50% {
            transform: rotate(15deg);
          }
        }
        @keyframes legBounce {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        @keyframes glowPulse {
          0%, 100% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.2);
          }
        }
        @keyframes sparkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.2) rotate(180deg);
          }
        }
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes speechBubblePop {
          0% {
            transform: translateX(-50%) scale(0) rotate(-10deg);
            opacity: 0;
          }
          60% {
            transform: translateX(-50%) scale(1.1) rotate(2deg);
          }
          100% {
            transform: translateX(-50%) scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes textWave {
          0%, 100% {
            transform: scale(1);
          }
          25% {
            transform: scale(1.1);
          }
          50% {
            transform: scale(0.95);
          }
          75% {
            transform: scale(1.05);
          }
        }
        @keyframes achievementSlideInLeft {
          0% {
            transform: translateX(-400px) scale(0.7) rotate(-10deg);
            opacity: 0;
            filter: blur(10px);
          }
          60% {
            transform: translateX(15px) scale(1.05) rotate(2deg);
            opacity: 0.9;
            filter: blur(2px);
          }
          80% {
            transform: translateX(-5px) scale(0.98) rotate(-1deg);
          }
          100% {
            transform: translateX(0) scale(1) rotate(0deg);
            opacity: 1;
            filter: blur(0);
          }
        }
        @keyframes achievementIconBounce {
          0% {
            transform: scale(0) rotate(-180deg) translateZ(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.3) rotate(15deg) translateZ(20px);
            opacity: 1;
          }
          70% {
            transform: scale(0.95) rotate(-8deg) translateZ(10px);
          }
          85% {
            transform: scale(1.05) rotate(4deg) translateZ(15px);
          }
          100% {
            transform: scale(1) rotate(0deg) translateZ(0);
            opacity: 1;
          }
        }
        @keyframes achievementIconPulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.3);
            opacity: 0.3;
          }
        }
        @keyframes achievementGlowRotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes achievementSparkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.5) rotate(180deg);
          }
        }
        @keyframes achievementTitlePop {
          0% {
            transform: translateY(10px);
            opacity: 0;
          }
          60% {
            transform: translateY(-2px);
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes achievementDescFade {
          0% {
            transform: translateY(5px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 0.95;
          }
        }
        @keyframes achievementExpPop {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          60% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes achievementProgress {
          0% {
            transform: scaleX(1);
          }
          100% {
            transform: scaleX(0);
          }
        }
        @keyframes achievementShine {
          0% {
            left: -100%;
          }
          50% {
            left: 100%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
      
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={boardStyle}
      >
        {blocks.map((block) => {
          // Slight per-block variation in connector prominence (0.9..1.05) – deterministic
          const v = ((Math.imul(block.id ^ 0x2c1b3c6d, 0x85ebca6b) >>> 0) % 16) / 100
          const scaleJitter = 0.9 + v // 0.90 - 1.05
          return (
            <PuzzleBlock
              key={block.id}
              block={block}
              onPointerDown={onPointerDown}
              highlight={highlightIds.has(block.id)}
              scale={scale}
              pattern={patternsById[block.id] || { top: false, right: false, bottom: false, left: false }}
              tabScale={initialTexts && initialTexts.length ? scaleJitter : 1}
            />
          )
        })}
      </div>

      <div style={rightPanelStyle}>
        {/* Output & Controls - Minimized height when success */}
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Output & Controls</div>
        {!isOutputMinimized && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                submitSolution();
              }} 
              style={{ padding: '8px 12px', borderRadius: 8, background: '#059669', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Submit
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetBoard();
              }} 
              style={{ padding: '8px 12px', borderRadius: 8, background: '#374151', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Reset
            </button>
            {showHintButton && (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (nextHintLevel) {
                    try {
                      await handleHintClick(nextHintLevel);
                    } catch (err) {
                      console.error('Hint click error:', err);
                    }
                  }
                }}
                disabled={!nextHintLevel}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: nextHintLevel ? '#f59e0b' : 'rgba(107, 114, 128, 0.5)',
                  color: 'white',
                  border: 'none',
                  cursor: nextHintLevel ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                  opacity: nextHintLevel ? 1 : 0.6
                }}
                title={nextHintLevel ? `Reveal ${hintButtonLabel}` : 'All hints have been used'}
              >
                <span style={{ fontSize: 16 }}>💡</span>
                <span>{hintButtonLabel}</span>
              </button>
            )}
          </div>
        )}

        {/* Hint Display */}
        {showHintButton && hintMessages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {hintMessages.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: 12,
                  background: 'rgba(251, 191, 36, 0.08)',
                  border: '1px solid rgba(251, 191, 36, 0.25)',
                  borderRadius: 8
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>
                  {entry.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-output, #eae6ff)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {entry.body}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.9, color: 'var(--text-primary, #eae6ff)' }}>Output</div>
        <div ref={outputRef} style={{
          background: 'var(--bg-output, rgba(17,24,39,0.6))',
          border: '1px solid var(--bg-output-border, rgba(255,255,255,0.08))',
          borderRadius: 8,
          height: isOutputMinimized ? 120 : Math.max(160, canvasHeight * 0.45),
          padding: 12,
          overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \\"Liberation Mono\\", \\"Courier New\\", monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          color: 'var(--text-output, #eae6ff)'
        }}>
{outputText}
        </div>

        {/* Result Status - Always visible, more prominent on success */}
        <div style={{ marginTop: 12, marginBottom: 8, fontSize: 13, opacity: 0.9, color: 'var(--text-primary, #eae6ff)' }}>Result</div>
        <div style={{
          background: resultStatus === 'success' ? 'rgba(16,185,129,0.1)' : 'var(--bg-output, rgba(17,24,39,0.6))',
          border: resultStatus === 'success' ? '2px solid rgba(16,185,129,0.4)' : '1px solid var(--bg-output-border, rgba(255,255,255,0.08))',
          borderRadius: 8,
          padding: 12,
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <span style={{
              display: 'inline-block',
              padding: '6px 12px',
              background: resultStatus === 'error' ? 'rgba(239,68,68,0.15)' : resultStatus === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(59,130,246,0.15)',
              color: resultStatus === 'error' ? '#ef4444' : resultStatus === 'success' ? '#10b981' : '#60a5fa',
              border: resultStatus === 'error' ? '1px solid rgba(239,68,68,0.35)' : resultStatus === 'success' ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(59,130,246,0.35)',
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 700
            }}>{resultStatus === 'error' ? 'Error' : resultStatus === 'success' ? '✓ Successful' : 'Pending'}</span>
            <span style={{ marginLeft: 10, opacity: 0.85, fontSize: 12, flex: 1, color: 'var(--text-output, #eae6ff)' }}>
              {resultDetails}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 16, marginBottom: 8, fontSize: 13, opacity: 0.9, fontWeight: 600, color: 'var(--text-primary, #eae6ff)' }}>Program Output</div>
        <div style={{
          background: 'var(--bg-output, rgba(17,24,39,0.75))',
          border: resultStatus === 'success' ? '1px solid rgba(16,185,129,0.35)' : resultStatus === 'error' ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--bg-output-border, rgba(255,255,255,0.08))',
          borderRadius: 8,
          padding: '12px 12px 16px 12px',
          maxHeight: 220,
          overflow: 'auto',
          overflowX: 'hidden',
          marginBottom: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          color: resultStatus === 'success' ? '#10b981' : 'var(--text-output, #eae6ff)',
          lineHeight: '1.6'
        }}>
          {displayedProgramOutput ? displayedProgramOutput : '(No output yet. Arrange blocks and submit to run your program.)'}
        </div>
      </div>
    </div>
    </>
  );
}

