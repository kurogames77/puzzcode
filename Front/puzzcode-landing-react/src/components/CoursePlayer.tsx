import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import JigsawCodePuzzle from './JigsawCodePuzzle'
import { getLessonById, type Lesson, type Level } from '../utils/courseManager'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

const getProgressCacheKey = (userId: string | null) => {
  if (!userId) return 'lesson_progress_cache_anonymous'
  return `lesson_progress_cache_${userId}`
}

const getLessonExpCacheKey = (userId: string | null) => {
  if (!userId) return 'lesson_exp_cache_anonymous'
  return `lesson_exp_cache_${userId}`
}

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'

const toSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const toLines = (code: string): string[] => {
  const normalized = code.replace(/\r/g, '').replace(/^\n+|\n+$/g, '')
  if (!normalized) return []
  const rawLines = normalized.split('\n')
  const indents = rawLines
    .filter(line => line.trim().length > 0)
    .map(line => (line.match(/^(\s*)/)?.[1].length ?? 0))
  const minIndent = indents.length ? Math.min(...indents) : 0
  return rawLines
    .map(line => line.slice(Math.min(minIndent, line.length)))
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
}

type LessonSeed = {
  title: string
  difficulty: Difficulty
  code: string
}

type LessonDefinition = {
  title: string
  difficulty: Difficulty
  slug: string
  blocks: string[]
}

type LessonProgressCacheEntry = {
  completed: number
  total: number
  completedLevels?: number[]
  updatedAt: number
}

type LessonExpCacheEntry = {
  lastLevelExp: number
  totalLessonExp: number
  updatedAt: number
}

const LESSON_EXP_PER_LEVEL_UI = 20

const buildLessons = (entries: LessonSeed[]): LessonDefinition[] =>
  entries.map(({ title, difficulty, code }) => ({
    title,
    difficulty,
    slug: toSlug(title),
    blocks: toLines(code)
  }))

const pythonSyntaxLessons: LessonDefinition[] = [
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "x = 42  # integer",
      "pi = 3.14  # float",
      "is_active = True  # boolean",
      "name = 'Alice'  # string",
      "print(type(x), type(name), type(pi), type(is_active))"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "score = 58  # integer",
      "temperature = 21.5  # float",
      "player = 'Blair'  # string",
      "is_ready = False  # boolean",
      "print(score, temperature, player, is_ready)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "count = 12  # integer",
      "ratio = 2.75  # float",
      "status = 'Processing'  # string",
      "is_done = True  # boolean",
      "print(status, count, ratio, is_done)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "apples = 5  # integer",
      "price = 0.99  # float",
      "customer = 'Drew'  # string",
      "paid = False  # boolean",
      "print(f'{customer} bought {apples} apples?', paid)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "level = 3  # integer",
      "speed = 1.8  # float",
      "username = 'Ember'  # string",
      "is_online = True  # boolean",
      "print(level, speed, username, is_online)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "tasks = 7  # integer",
      "progress = 0.6  # float",
      "owner = 'Flynn'  # string",
      "is_archived = False  # boolean",
      "print(f'{owner} progress: {progress * 100:.0f}%', is_archived)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "points = 11  # integer",
      "accuracy = 98.5  # float",
      "alias = 'Gray'  # string",
      "verified = True  # boolean",
      "print(points, accuracy, alias, verified)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "items = 4  # integer",
      "weight = 2.35  # float",
      "label = 'Harper'  # string",
      "is_fragile = False  # boolean",
      "print(items, weight, label, is_fragile)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "rounds = 9  # integer",
      "chance = 0.42  # float",
      "agent = 'Indi'  # string",
      "has_key = True  # boolean",
      "print(f'{agent} chance {chance}', has_key)"
    ]
  },
  {
    title: 'Syntax, variables, and types',
    difficulty: 'Beginner',
    slug: 'syntax-variables-and-types',
    blocks: [
      "wins = 14  # integer",
      "ratio = 1.25  # float",
      "champion = 'Jules'  # string",
      "active = True  # boolean",
      "print(wins, ratio, champion, active)"
    ]
  }
]

const pythonControlFlowLessons: LessonDefinition[] = [
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'numbers = [1, 2, 3, 4]',
      'total = 0',
      'for n in numbers:',
      '    total += n',
      "if total % 2 == 0:",
      "    print('even total')",
      'else:',
      "    print('odd total')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'numbers = [1, 5, 6, 7]',
      'total = 0',
      'for n in numbers:',
      '    total += n',
      "if total % 5 == 0:",
      "    print('even total')",
      'else:',
      "    print('odd total')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'numbers = [2, 4, 6, 8]',
      'total = 0',
      'for n in numbers:',
      '    total += n',
      "if total % 3 == 0:",
      "    print('divisible by 3')",
      'else:',
      "    print('not divisible by 3')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'scores = [12, 15, 18]',
      'total = 0',
      'for score in scores:',
      '    total += score',
      'if total > 40:',
      "    print('passed')",
      'else:',
      "    print('try again')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'temperatures = [18, 20, 22]',
      'cold = 0',
      'for temp in temperatures:',
      '    if temp < 19:',
      '        cold += 1',
      'if cold:',
      "    print('too cold')",
      'else:',
      "    print('all good')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'items = [3, 4, 5]',
      'product = 1',
      'for value in items:',
      '    product *= value',
      'if product > 60:',
      "    print('big product')",
      'else:',
      "    print('small product')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'values = [2, 7, 9]',
      'odd_count = 0',
      'for value in values:',
      '    if value % 2 == 1:',
      '        odd_count += 1',
      'if odd_count >= 2:',
      "    print('many odds')",
      'else:',
      "    print('few odds')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'steps = [1, 2, 3, 4]',
      'total = 0',
      'for step in steps:',
      '    total += step',
      'if total == 10:',
      "    print('perfect sum')",
      'else:',
      "    print('needs work')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'numbers = [2, 4, 5, 9]',
      'even = 0',
      'for n in numbers:',
      '    if n % 2 == 0:',
      '        even += 1',
      'if even >= 2:',
      "    print('even mix')",
      'else:',
      "    print('odd mix')"
    ]
  },
  {
    title: 'Control flow and loops',
    difficulty: 'Beginner',
    slug: 'control-flow-and-loops',
    blocks: [
      'numbers = [3, 5, 7, 9]',
      'total = 0',
      'for n in numbers:',
      '    total += n',
      'if total % 4 == 0:',
      "    print('multiple of four')",
      'else:',
      "    print('not a multiple')"
    ]
  }
]

const SYNTAX_LEVEL_COUNT = pythonSyntaxLessons.length
const HINT_EXP_COSTS: Record<1 | 2 | 3, number> = {
  1: 100,
  2: 150,
  3: 200,
}

const baseNames = ['Alex', 'Blair', 'Casey', 'Drew', 'Ember', 'Flynn', 'Gray', 'Harper', 'Indi', 'Jules']

function formatDecimal(value: number, digits = 2) {
  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function adjustNumberLiteral(raw: string, levelIndex: number): string {
  const value = parseFloat(raw)
  if (!Number.isFinite(value)) return raw
  if (value === 0) return raw
  const isInt = raw.indexOf('.') === -1
  const magnitude = Math.max(1, Math.abs(value))
  const delta = isInt ? (levelIndex + 1) * (magnitude < 5 ? 2 : 3) : (levelIndex + 1) * 0.35
  const newValue = value >= 0 ? value + delta : value - delta
  if (isInt) return String(Math.round(newValue))
  const decimals = raw.split('.')[1]?.length ?? 2
  return formatDecimal(newValue, Math.max(2, decimals))
}

function adjustBooleanLiteral(raw: string, levelIndex: number, lineIndex: number): string {
  const shouldBeTrue = ((levelIndex + lineIndex) % 2) === 0
  const isLower = raw === raw.toLowerCase()
  if (shouldBeTrue) return isLower ? 'true' : 'True'
  return isLower ? 'false' : 'False'
}

function mutateLine(line: string, lang: string, levelIndex: number, lineIndex: number): string {
  let result = line
  result = result.replace(/(?<![A-Za-z_])(\-?\d+(?:\.\d+)?)(?![A-Za-z_])/g, (match) => adjustNumberLiteral(match, levelIndex))
  result = result.replace(/(['"])([A-Za-z][A-Za-z0-9]*)\1/g, (match, quote, value) => {
    if (value.toLowerCase() === value) return match
    const newName = baseNames[(levelIndex + lineIndex) % baseNames.length]
    return `${quote}${newName}${quote}`
  })
  result = result.replace(/\b(True|False|true|false)\b/g, (match) => adjustBooleanLiteral(match, levelIndex, lineIndex))
  return result
}

function generateLessonVariants(base: LessonDefinition, lang: string, count: number): LessonDefinition[] {
  return Array.from({ length: count }, (_, idx) => ({
    title: base.title,
    difficulty: base.difficulty,
    slug: base.slug,
    blocks: base.blocks.map((line, lineIdx) => mutateLine(line, lang, idx, lineIdx))
  }))
}

function buildTemplateDeck(
  lang: string,
  title: string,
  slug: string,
  difficulty: LessonDefinition['difficulty'],
  baseBlocks: string[],
  count = SYNTAX_LEVEL_COUNT
): LessonDefinition[] {
  return Array.from({ length: count }, (_, idx) => ({
    title,
    difficulty,
    slug,
    blocks: baseBlocks.map((line, lineIdx) => idx === 0 ? line : mutateLine(line, lang, idx, lineIdx))
  }))
}

const lessonDeckOverrides: Record<string, Record<string, LessonDefinition[]>> = {
  cpp: {
    'stl-containers-and-algorithms': [
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> nums{11, 12, 13, 14, 20};',
          'auto evens = std::count_if(nums.begin(), nums.end(), [](int n) { return n % 2 == 0; });',
          'std::cout << "even count: " << evens << std::endl;',
          'std::sort(nums.begin(), nums.end());',
          'std::cout << "largest: " << nums.back() << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <numeric>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> scores{3, 6, 9, 12};',
          'auto total = std::accumulate(scores.begin(), scores.end(), 0);',
          'std::cout << "total: " << total << std::endl;',
          'std::reverse(scores.begin(), scores.end());',
          'std::cout << "first after reverse: " << scores.front() << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> data{4, 7, 2, 9, 5};',
          'std::nth_element(data.begin(), data.begin() + 2, data.end());',
          'std::cout << "median candidate: " << data[2] << std::endl;',
          'std::sort(data.begin(), data.end());',
          'for (int value : data) std::cout << value << " ";',
          'std::cout << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> nums{5, 8, 12, 15};',
          'auto it = std::find_if(nums.begin(), nums.end(), [](int n) { return n > 10; });',
          'if (it != nums.end()) std::cout << "first > 10: " << *it << std::endl;',
          'std::rotate(nums.begin(), nums.begin() + 1, nums.end());',
          'std::cout << "front after rotate: " << nums.front() << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> values{2, 4, 6, 8, 9};',
          'auto allEven = std::all_of(values.begin(), values.end(), [](int n) { return n % 2 == 0; });',
          'std::cout << std::boolalpha << "all even: " << allEven << std::endl;',
          'auto odds = std::count_if(values.begin(), values.end(), [](int n) { return n % 2 == 1; });',
          'std::cout << "odd count: " << odds << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> nums{3, 4, 5, 6, 7};',
          'std::vector<int> squares(nums.size());',
          'std::transform(nums.begin(), nums.end(), squares.begin(), [](int n) { return n * n; });',
          'for (int sq : squares) std::cout << sq << " ";',
          'std::cout << std::endl;',
          'std::cout << "max square: " << *std::max_element(squares.begin(), squares.end()) << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> readings{1, 2, 3, 4, 5, 6};',
          'auto pivot = std::partition(readings.begin(), readings.end(), [](int n) { return n < 4; });',
          'std::cout << "lower count: " << std::distance(readings.begin(), pivot) << std::endl;',
          'std::stable_sort(readings.begin(), pivot);',
          'std::stable_sort(pivot, readings.end());',
          'for (int value : readings) std::cout << value << " ";',
          'std::cout << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> stream{10, 3, 5, 12, 4};',
          'stream.erase(std::remove_if(stream.begin(), stream.end(), [](int n) { return n % 3 == 0; }), stream.end());',
          'std::cout << "remaining size: " << stream.size() << std::endl;',
          'std::sort(stream.begin(), stream.end());',
          'for (int n : stream) std::cout << n << " ";',
          'std::cout << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <vector>',
          'std::vector<int> nums{8, 2, 6, 4, 10};',
          'auto minmax = std::minmax_element(nums.begin(), nums.end());',
          'std::cout << "min: " << *minmax.first << ", max: " << *minmax.second << std::endl;',
          'std::sort(nums.rbegin(), nums.rend());',
          'std::cout << "after sort descending: " << nums.front() << std::endl;'
        ]
      },
      {
        title: 'STL containers and algorithms',
        difficulty: 'Intermediate',
        slug: 'stl-containers-and-algorithms',
        blocks: [
          '#include <algorithm>',
          '#include <iostream>',
          '#include <numeric>',
          '#include <vector>',
          'std::vector<int> weights{2, 5, 7, 11};',
          'std::partial_sum(weights.begin(), weights.end(), weights.begin());',
          'for (int prefix : weights) std::cout << prefix << " ";',
          'std::cout << std::endl;',
          'std::adjacent_difference(weights.begin(), weights.end(), weights.begin());',
          'std::cout << "first diff: " << weights[1] << std::endl;'
        ]
      }
    ]
  }
}

function buildDeckForLesson(baseLesson: LessonDefinition, lang: string, count: number): LessonDefinition[] {
  const overrideDeck = lessonDeckOverrides[lang]?.[baseLesson.slug]
  if (overrideDeck && overrideDeck.length) {
    return Array.from({ length: count }, (_, idx) => {
      const template = overrideDeck[idx % overrideDeck.length]
      return {
        title: template.title,
        difficulty: template.difficulty,
        slug: template.slug,
        blocks: template.blocks.map(line => line)
      }
    })
  }
  return generateLessonVariants(baseLesson, lang, count)
}

const lessonLibrary: Record<string, LessonDefinition[]> = {
  python: buildLessons([
    {
      title: 'Syntax, variables, and types',
      difficulty: 'Beginner',
      code: `
x = 42  # integer
name = 'Alice'  # string
pi = 3.14  # float
is_active = True  # boolean
print(type(x), type(name), type(pi), type(is_active))
      `
    },
    {
      title: 'Control flow and loops',
      difficulty: 'Beginner',
      code: `
numbers = [1, 2, 3, 4]
total = 0
for n in numbers:
    total += n
if total % 2 == 0:
    print('even total')
else:
    print('odd total')
      `
    },
    {
      title: 'Functions and modules',
      difficulty: 'Beginner',
      code: `
import math

def area(radius):
    return math.pi * radius ** 2

result = area(5)
print(f'Area: {result:.2f}')
      `
    },
    {
      title: 'Lists, tuples, dictionaries',
      difficulty: 'Beginner',
      code: `
fruits = ['apple', 'banana', 'cherry']
numbers = (1, 2, 3)
profile = {'name': 'Lia', 'level': 3}
fruits.append('date')
print(len(numbers), profile['name'])
      `
    },
    {
      title: 'Files and exceptions',
      difficulty: 'Intermediate',
      code: `
from pathlib import Path

path = Path('notes.txt')
try:
    data = path.read_text()
except FileNotFoundError:
    data = ''
print(len(data))
      `
    },
    {
      title: 'OOP basics (classes/objects)',
      difficulty: 'Intermediate',
      code: `
class Player:
    def __init__(self, name, score=0):
        self.name = name
        self.score = score

    def increase(self, value):
        self.score += value

player = Player('Eli')
player.increase(10)
print(player.score)
      `
    },
    {
      title: 'Virtual environments and packages',
      difficulty: 'Intermediate',
      code: `
env_path = 'env'
packages = ['requests', 'rich']
commands = [f'python -m venv {env_path}']
commands += [f'pip install {pkg}' for pkg in packages]
for cmd in commands:
    print(cmd)
      `
    },
    {
      title: 'List/dict comprehensions',
      difficulty: 'Intermediate',
      code: `
numbers = [1, 2, 3, 4, 5]
squares = [n * n for n in numbers]
even_map = {n: (n % 2 == 0) for n in numbers}
filtered = [n for n in numbers if n > 2]
print(squares, even_map, filtered)
      `
    },
    {
      title: 'Generators and iterators',
      difficulty: 'Advanced',
      code: `
def countdown(start):
    while start > 0:
        yield start
        start -= 1

stream = countdown(3)
print(next(stream))
for value in stream:
    print(value)
      `
    },
    {
      title: 'Decorators and context managers',
      difficulty: 'Advanced',
      code: `
import functools

def trace(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print(f'calling {fn.__name__}')
        return fn(*args, **kwargs)

    return wrapper

@trace
def greet(name):
    return f'Hi {name}'

print(greet('Ria'))
      `
    },
    {
      title: 'Asyncio concurrency',
      difficulty: 'Advanced',
      code: `
import asyncio

async def fetch(value):
    await asyncio.sleep(0.1)
    return value * 2

async def main():
    results = await asyncio.gather(fetch(1), fetch(2), fetch(3))
    print(results)

asyncio.run(main())
      `
    },
    {
      title: 'Testing and packaging',
      difficulty: 'Advanced',
      code: `
def add(a, b):
    return a + b

def test_add():
    assert add(2, 3) == 5

if __name__ == '__main__':
    test_add()
    print('tests passed')
      `
    }
  ]),
  csharp: buildLessons([
    {
      title: 'Syntax and types',
      difficulty: 'Beginner',
      code: `
using System;

int score = 42;
string name = "Alex";
double ratio = 0.75;
bool isActive = true;
Console.WriteLine($"{name} - {score} - {ratio} - {isActive}");
      `
    },
    {
      title: 'Flow control',
      difficulty: 'Beginner',
      code: `
int[] values = { 1, 2, 3, 4 };
int sum = 0;
foreach (var value in values)
{
    sum += value;
}

if (sum > 5)
{
    Console.WriteLine("High");
}
else
{
    Console.WriteLine("Low");
}
      `
    },
    {
      title: 'Methods and classes',
      difficulty: 'Beginner',
      code: `
using System;

class Greeter
{
    public string Message { get; }

    public Greeter(string message)
    {
        Message = message;
    }

    public void SayHello(string name)
    {
        Console.WriteLine($"{Message}, {name}");
    }
}

var greeter = new Greeter("Hello");
greeter.SayHello("Taylor");
      `
    },
    {
      title: 'Collections and LINQ basics',
      difficulty: 'Beginner',
      code: `
using System;
using System.Collections.Generic;
using System.Linq;

var numbers = new List<int> { 1, 2, 3, 4, 5 };
var evens = numbers.Where(n => n % 2 == 0).ToList();
var sum = numbers.Sum();
Console.WriteLine(string.Join(",", evens));
Console.WriteLine(sum);
      `
    },
    {
      title: 'Interfaces and inheritance',
      difficulty: 'Intermediate',
      code: `
using System;

interface IShape
{
    double Area();
}

abstract class Shape
{
    public string Name { get; set; }
}

class Circle : Shape, IShape
{
    public double Radius { get; set; }
    public double Area() => Math.PI * Radius * Radius;
}

var shape = new Circle { Name = "unit", Radius = 1.0 };
Console.WriteLine(shape.Area());
      `
    },
    {
      title: 'Generics',
      difficulty: 'Intermediate',
      code: `
using System.Collections.Generic;
using System.Linq;

class Repository<T>
{
    private readonly List<T> _items = new();
    public void Add(T item) => _items.Add(item);
    public IEnumerable<T> All() => _items;
}

var repo = new Repository<string>();
repo.Add("alpha");
Console.WriteLine(repo.All().First());
      `
    },
    {
      title: 'Exception handling',
      difficulty: 'Intermediate',
      code: `
using System;

try
{
    var value = int.Parse("42");
    Console.WriteLine(value);
}
catch (FormatException ex)
{
    Console.WriteLine(ex.Message);
}
finally
{
    Console.WriteLine("Done");
}
      `
    },
    {
      title: 'Async/await',
      difficulty: 'Intermediate',
      code: `
using System;
using System.Net.Http;
using System.Threading.Tasks;

async Task<int> FetchLengthAsync(string url)
{
    using var client = new HttpClient();
    var text = await client.GetStringAsync(url);
    return text.Length;
}

var length = await FetchLengthAsync("https://example.com");
Console.WriteLine(length);
      `
    },
    {
      title: 'LINQ deep-dive',
      difficulty: 'Advanced',
      code: `
using System;
using System.Linq;

var people = new[]
{
    new { Name = "Ana", Age = 29 },
    new { Name = "Ben", Age = 35 },
    new { Name = "Cara", Age = 26 }
};

var query = people.Where(p => p.Age > 30).Select(p => p.Name);
Console.WriteLine(string.Join(", ", query));
      `
    },
    {
      title: 'Dependency injection basics',
      difficulty: 'Advanced',
      code: `
using System;

interface ILogger { void Log(string message); }

class ConsoleLogger : ILogger
{
    public void Log(string message) => Console.WriteLine(message);
}

class Service
{
    private readonly ILogger _logger;
    public Service(ILogger logger) => _logger = logger;
    public void Run() => _logger.Log("Service running");
}

var service = new Service(new ConsoleLogger());
service.Run();
      `
    },
    {
      title: 'Unit testing',
      difficulty: 'Advanced',
      code: `
using System;

int Add(int a, int b) => a + b;

void ShouldAdd()
{
    if (Add(2, 2) != 4)
    {
        throw new Exception("Add failed");
    }
}

ShouldAdd();
Console.WriteLine("All tests passed");
      `
    },
    {
      title: 'Performance tips',
      difficulty: 'Advanced',
      code: `
using System;

Span<int> buffer = stackalloc int[4] { 1, 2, 3, 4 };
var sum = 0;
foreach (var value in buffer)
{
    sum += value;
}

Console.WriteLine(sum);
      `
    }
  ]),
  javascript: buildLessons([
    {
      title: 'Syntax and variables',
      difficulty: 'Beginner',
      code: `
const score = 42;
let name = 'Kai';
const ratio = 0.75;
let isActive = true;
console.log(typeof score, typeof name, typeof ratio, typeof isActive);
      `
    },
    {
      title: 'DOM basics',
      difficulty: 'Beginner',
      code: `
const heading = document.createElement('h1');
heading.textContent = 'Hello DOM';
document.body.appendChild(heading);
heading.classList.add('title');
console.log(heading.outerHTML);
      `
    },
    {
      title: 'Functions and scopes',
      difficulty: 'Beginner',
      code: `
function greet(name) {
  return \`Hello \${name}\`;
}

let count = 0;
function increment(step = 1) {
  count += step;
  return count;
}

const value = increment(2);
console.log(greet('Tia'), value);
      `
    },
    {
      title: 'Arrays/objects',
      difficulty: 'Beginner',
      code: `
const fruits = ['apple', 'banana', 'cherry'];
fruits.push('date');
const profile = { name: 'Liu', level: 3 };
const levels = [1, 2, 3].map(n => n * 2);
console.log(fruits.length, profile.name, levels);
      `
    },
    {
      title: 'Promises and async/await',
      difficulty: 'Intermediate',
      code: `
function fetchDouble(value) {
  return new Promise(resolve => {
    setTimeout(() => resolve(value * 2), 50);
  });
}

async function run() {
  const results = await Promise.all([fetchDouble(1), fetchDouble(2)]);
  console.log(results);
}

run();
      `
    },
    {
      title: 'Modules',
      difficulty: 'Intermediate',
      code: `
export function add(a, b) {
  return a + b;
}

export const PI = 3.14;
import { add, PI as base } from './math.js';
console.log(add(base, 2));
      `
    },
    {
      title: 'Fetch and APIs',
      difficulty: 'Intermediate',
      code: `
async function loadUsers() {
  const response = await fetch('https://api.example.com/users');
  if (!response.ok) throw new Error('Request failed');
  const data = await response.json();
  console.log(data.length);
}

loadUsers().catch(err => console.error(err.message));
      `
    },
    {
      title: 'ES6+ features',
      difficulty: 'Intermediate',
      code: `
const settings = { theme: 'dark', lang: 'en', debug: false };
const { theme, ...rest } = settings;
const numbers = [1, 2, 3];
const extended = [...numbers, 4];
const pairs = numbers.map(n => [n, n ** 2]);
console.log(theme, rest, extended, pairs);
      `
    },
    {
      title: 'Event loop internals',
      difficulty: 'Advanced',
      code: `
console.log('start');
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('microtask'));
queueMicrotask(() => console.log('queued'));
console.log('end');
      `
    },
    {
      title: 'Performance and memory',
      difficulty: 'Advanced',
      code: `
const cache = new Map();
for (let i = 0; i < 3; i++) {
  cache.set(i, { value: i * 2 });
}

const clone = structuredClone([...cache.values()]);
console.log(clone.length);
      `
    },
    {
      title: 'Testing',
      difficulty: 'Advanced',
      code: `
function sum(a, b) {
  return a + b;
}

function testSum() {
  if (sum(2, 2) !== 4) {
    throw new Error('sum failed');
  }
}

testSum();
console.log('tests passed');
      `
    },
    {
      title: 'Patterns and architecture',
      difficulty: 'Advanced',
      code: `
const createStore = () => {
  let state = 0;
  const listeners = [];
  return {
    subscribe(fn) {
      listeners.push(fn);
    },
    dispatch(action) {
      if (action.type === 'increment') state += action.amount;
      listeners.forEach(fn => fn(state));
    }
  };
};

const store = createStore();
store.subscribe(value => console.log(value));
store.dispatch({ type: 'increment', amount: 2 });
      `
    }
  ]),
  cpp: buildLessons([
    {
      title: 'Syntax, I/O',
      difficulty: 'Beginner',
      code: `
#include <iostream>

int score = 42;
std::string name = "Ada";
double ratio = 0.5;
bool active = true;
std::cout << name << " " << score << " " << ratio << " " << std::boolalpha << active << std::endl;
      `
    },
    {
      title: 'Control flow',
      difficulty: 'Beginner',
      code: `
#include <iostream>
#include <vector>

std::vector<int> numbers{1, 2, 3, 4};
int total = 0;
for (int value : numbers) {
    total += value;
}

if (total % 2 == 0) {
    std::cout << "even" << std::endl;
} else {
    std::cout << "odd" << std::endl;
}
      `
    },
    {
      title: 'Functions',
      difficulty: 'Beginner',
      code: `
#include <iostream>

int square(int value) {
    return value * value;
}

int result = square(5);
std::cout << result << std::endl;
      `
    },
    {
      title: 'Pointers and references',
      difficulty: 'Beginner',
      code: `
#include <iostream>

int value = 10;
int* ptr = &value;
int& ref = value;
*ptr += 2;
ref += 3;
std::cout << value << std::endl;
      `
    },
    {
      title: 'Classes and RAII',
      difficulty: 'Intermediate',
      code: `
#include <iostream>

class Timer {
public:
    Timer() { std::cout << "start" << std::endl; }
    ~Timer() { std::cout << "stop" << std::endl; }
};

void run() {
    Timer timer;
    std::cout << "work" << std::endl;
}

run();
      `
    },
    {
      title: 'STL containers and algorithms',
      difficulty: 'Intermediate',
      code: `
#include <algorithm>
#include <iostream>
#include <vector>

std::vector<int> nums{1, 2, 3, 4, 5};
auto evens = std::count_if(nums.begin(), nums.end(), [](int n) { return n % 2 == 0; });
std::cout << evens << std::endl;
std::sort(nums.begin(), nums.end(), std::greater<int>());
std::cout << nums.front() << std::endl;
      `
    },
    {
      title: 'Templates',
      difficulty: 'Intermediate',
      code: `
#include <iostream>

template <typename T>
T max_value(T a, T b) {
    return a > b ? a : b;
}

std::cout << max_value(3, 7) << std::endl;
std::cout << max_value(2.5, 1.4) << std::endl;
      `
    },
    {
      title: 'Compilation and linking',
      difficulty: 'Intermediate',
      code: `
#include <iostream>

const char* compileCmd = "g++ -std=c++20 main.cpp -o app";
const char* runCmd = "./app";
std::cout << compileCmd << std::endl;
std::cout << runCmd << std::endl;
      `
    },
    {
      title: 'Smart pointers',
      difficulty: 'Advanced',
      code: `
#include <iostream>
#include <memory>

auto ptr = std::make_unique<int>(5);
std::cout << *ptr << std::endl;
std::unique_ptr<int> other = std::move(ptr);
if (!ptr) {
    std::cout << "moved" << std::endl;
}
      `
    },
    {
      title: 'Move semantics',
      difficulty: 'Advanced',
      code: `
#include <iostream>
#include <utility>
#include <vector>

std::vector<int> build() {
    std::vector<int> data{1, 2, 3};
    return data;
}

std::vector<int> values = build();
std::vector<int> moved = std::move(values);
std::cout << moved.size() << std::endl;
      `
    },
    {
      title: 'Concurrency',
      difficulty: 'Advanced',
      code: `
#include <iostream>
#include <thread>

int counter = 0;

void add() {
    for (int i = 0; i < 1000; ++i) ++counter;
}

std::thread t1(add);
std::thread t2(add);
t1.join();
t2.join();
std::cout << counter << std::endl;
      `
    },
    {
      title: 'Profiling and optimization',
      difficulty: 'Advanced',
      code: `
#include <chrono>
#include <iostream>

auto start = std::chrono::steady_clock::now();
volatile int total = 0;
for (int i = 0; i < 100000; ++i) {
    total += i;
}
auto end = std::chrono::steady_clock::now();
std::cout << total << " in " << (end - start).count() << std::endl;
      `
    }
  ]),
  php: buildLessons([
    {
      title: 'Syntax and variables',
      difficulty: 'Beginner',
      code: `
<?php
$score = 42;
$name = 'Mina';
$ratio = 0.75;
$isActive = true;
echo gettype($score) . ' ' . gettype($name) . PHP_EOL;
      `
    },
    {
      title: 'Arrays and strings',
      difficulty: 'Beginner',
      code: `
<?php
$fruits = ['apple', 'banana', 'cherry'];
array_push($fruits, 'date');
$message = implode(', ', $fruits);
echo strtoupper($message) . PHP_EOL;
      `
    },
    {
      title: 'Forms and superglobals',
      difficulty: 'Beginner',
      code: `
<?php
$name = $_POST['name'] ?? 'Guest';
$email = $_POST['email'] ?? 'unknown@example.com';
echo "Welcome, {$name} ({$email})";
      `
    },
    {
      title: 'Basic CRUD with PDO',
      difficulty: 'Beginner',
      code: `
<?php
$pdo = new PDO('mysql:host=localhost;dbname=app', 'root', '');
$stmt = $pdo->prepare('INSERT INTO users (name) VALUES (:name)');
$stmt->execute(['name' => 'Lia']);
$users = $pdo->query('SELECT * FROM users')->fetchAll(PDO::FETCH_ASSOC);
echo count($users);
      `
    },
    {
      title: 'Sessions and auth',
      difficulty: 'Intermediate',
      code: `
<?php
session_start();
if (!isset($_SESSION['user'])) {
    $_SESSION['user'] = ['name' => 'Alex'];
}
echo 'Logged in as ' . $_SESSION['user']['name'];
      `
    },
    {
      title: 'OOP basics',
      difficulty: 'Intermediate',
      code: `
<?php
class User
{
    public function __construct(public string $name, private int $score = 0) {}

    public function addScore(int $value): void
    {
        $this->score += $value;
    }

    public function score(): int
    {
        return $this->score;
    }
}

$user = new User('Rin');
$user->addScore(10);
echo $user->score();
      `
    },
    {
      title: 'Composer and autoloading',
      difficulty: 'Intermediate',
      code: `
<?php
require __DIR__ . '/vendor/autoload.php';
use Carbon\Carbon;

$now = Carbon::now();
echo $now->toDateTimeString();
      `
    },
    {
      title: 'Error handling',
      difficulty: 'Intermediate',
      code: `
<?php
try {
    throw new RuntimeException('oops');
} catch (RuntimeException $e) {
    echo $e->getMessage();
} finally {
    echo PHP_EOL . 'done';
}
      `
    },
    {
      title: 'MVC concepts',
      difficulty: 'Advanced',
      code: `
<?php
class Controller
{
    public function __construct(private View $view) {}

    public function index(array $data): string
    {
        return $this->view->render('home', $data);
    }
}

class View
{
    public function render(string $template, array $data): string
    {
        extract($data);
        ob_start();
        include __DIR__ . "/{$template}.php";
        return ob_get_clean();
    }
}
      `
    },
    {
      title: 'Testing',
      difficulty: 'Advanced',
      code: `
<?php
function add(int $a, int $b): int
{
    return $a + $b;
}

assert(add(2, 3) === 5);
echo 'tests passed';
      `
    },
    {
      title: 'Security best practices',
      difficulty: 'Advanced',
      code: `
<?php
$input = $_GET['term'] ?? '';
$safe = htmlspecialchars($input, ENT_QUOTES, 'UTF-8');
echo $safe;
      `
    },
    {
      title: 'Performance',
      difficulty: 'Advanced',
      code: `
<?php
$items = range(1, 1000);
$sum = array_reduce($items, fn($carry, $item) => $carry + $item, 0);
echo $sum;
      `
    }
  ]),
  mysql: buildLessons([
    {
      title: 'SELECT, INSERT, UPDATE, DELETE',
      difficulty: 'Beginner',
      code: `
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64)
);

INSERT INTO users (name) VALUES ('Ana');
UPDATE users SET name = 'Bea' WHERE id = 1;
DELETE FROM users WHERE id = 2;
SELECT * FROM users;
      `
    },
    {
      title: 'WHERE and ORDER BY',
      difficulty: 'Beginner',
      code: `
SELECT id, name
FROM users
WHERE name LIKE 'A%'
ORDER BY name ASC;
      `
    },
    {
      title: 'Aggregations and GROUP BY',
      difficulty: 'Beginner',
      code: `
SELECT department, COUNT(*) AS total
FROM employees
GROUP BY department
HAVING COUNT(*) > 2;
      `
    },
    {
      title: 'Joins basics',
      difficulty: 'Beginner',
      code: `
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;
      `
    },
    {
      title: 'Subqueries and views',
      difficulty: 'Intermediate',
      code: `
CREATE VIEW active_users AS
SELECT id, name FROM users WHERE active = 1;

SELECT * FROM active_users
WHERE id IN (SELECT user_id FROM orders);
      `
    },
    {
      title: 'Indexes',
      difficulty: 'Intermediate',
      code: `
CREATE INDEX idx_users_email ON users(email);
EXPLAIN SELECT * FROM users WHERE email = 'demo@example.com';
      `
    },
    {
      title: 'Transactions',
      difficulty: 'Intermediate',
      code: `
START TRANSACTION;
UPDATE accounts SET balance = balance - 50 WHERE id = 1;
UPDATE accounts SET balance = balance + 50 WHERE id = 2;
COMMIT;
      `
    },
    {
      title: 'Schema design',
      difficulty: 'Intermediate',
      code: `
CREATE TABLE projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  owner_id INT,
  CONSTRAINT fk_projects_users FOREIGN KEY (owner_id) REFERENCES users(id)
);
      `
    },
    {
      title: 'Stored procedures',
      difficulty: 'Advanced',
      code: `
DELIMITER //
CREATE PROCEDURE give_bonus(IN userId INT, IN amount INT)
BEGIN
  UPDATE users SET score = score + amount WHERE id = userId;
END //
DELIMITER ;
      `
    },
    {
      title: 'Query optimization',
      difficulty: 'Advanced',
      code: `
EXPLAIN ANALYZE SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 7 DAY;
OPTIMIZE TABLE orders;
      `
    },
    {
      title: 'Locking and isolation',
      difficulty: 'Advanced',
      code: `
SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE;
START TRANSACTION;
SELECT * FROM inventory WHERE id = 5 FOR UPDATE;
COMMIT;
      `
    },
    {
      title: 'Backup and replication basics',
      difficulty: 'Advanced',
      code: `
SHOW MASTER STATUS;
BACKUP DATABASE app TO DISK = 'app.bak';
CHANGE MASTER TO MASTER_HOST='db-primary', MASTER_USER='replica';
      `
    }
  ])
}

const fallbackLesson: LessonDefinition = lessonLibrary.python[0]

const languageNoise: Record<string, string[]> = {
  default: [
    'temp = 99',
    'debug = false',
    'print("debug")',
    'result = None'
  ],
  python: [
    "flag = False",
    "buffer = []",
    "status = 'pending'",
    "value = sum(range(3))",
    "print('extra block')"
  ],
  csharp: [
    'var temp = 0;',
    'Console.WriteLine("trace");',
    'bool debug = false;',
    'var buffer = new List<int>();'
  ],
  javascript: [
    'let temp = 0;',
    "console.log('debug');",
    'const noop = () => {};',
    'window.title = "Puzzle";'
  ],
  cpp: [
    '#include <string>',
    'std::vector<int> buffer;',
    'std::cout << "debug" << std::endl;',
    'int temp = 0;'
  ],
  php: [
    '<?php $debug = true; ?>',
    'echo "debug";',
    '$tmp = [];',
    '$count = rand(1, 5);'
  ],
  mysql: [
    'SHOW TABLES;',
    'SELECT NOW();',
    'DESC users;',
    'FLUSH PRIVILEGES;'
  ]
}

const parseDifficulty = (value: string): Difficulty | null => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.startsWith('beginner')) return 'Beginner'
  if (normalized.startsWith('intermediate')) return 'Intermediate'
  if (normalized.startsWith('advanced')) return 'Advanced'
  return null
}

export default function CoursePlayer() {
  const { user } = useAuth()
  const userId = user?.id || null
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeLang = (searchParams.get('lang') || '').toLowerCase()
  const topicSlug = (searchParams.get('topic') || '').toLowerCase()
  const difficultyParam = searchParams.get('difficulty') || ''
  const lessonIdParam = searchParams.get('lesson') || ''
  
  // Normalize language key - handle csharp, c#, etc.
  const normalizeLangKey = (lang: string): string => {
    const normalized = lang.toLowerCase().trim()
    if (normalized === 'csharp' || normalized === 'c#' || normalized === 'cs') return 'csharp'
    if (normalized === 'javascript' || normalized === 'js') return 'javascript'
    if (normalized === 'cpp' || normalized === 'c++') return 'cpp'
    return normalized || 'python'
  }
  
  const langKey = normalizeLangKey(activeLang)

  // State for database lesson
  const [dbLesson, setDbLesson] = useState<Lesson | null>(null)
  const [dbLevels, setDbLevels] = useState<Level[]>([])
  const [isLoadingLesson, setIsLoadingLesson] = useState(false)
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Easy')
  
  // Use ref to track recommended difficulty for immediate use (bypasses React state batching)
  const recommendedDifficultyRef = useRef<'Easy' | 'Medium' | 'Hard' | null>(null)
  const [studentExp, setStudentExp] = useState<number | null>(null)
  const [hintUnlockLevel, setHintUnlockLevel] = useState<0 | 1 | 2 | 3>(0)
  const [pendingHintPurchase, setPendingHintPurchase] = useState<{ level: 1 | 2 | 3; cost: number } | null>(null)
  const [hintModalState, setHintModalState] = useState<{ open: boolean; loading: boolean; error: string }>({ open: false, loading: false, error: '' })
  const hintResolverRef = useRef<((allowed: boolean) => void) | null>(null)
  const [currentAchievements, setCurrentAchievements] = useState<Array<{ title: string; description: string; icon?: string; expReward?: number }>>([])
  
  // Force re-render when difficulty recommendation changes
  const [difficultyUpdateTrigger, setDifficultyUpdateTrigger] = useState(0)

  // Helper function to set initial difficulty based on lesson difficulty
  const setInitialDifficultyForLesson = useCallback((lesson: Lesson, setDifficulty: (diff: 'Easy' | 'Medium' | 'Hard') => void) => {
    if (!lesson.levels || lesson.levels.length === 0) return
    
    // Map lesson difficulty to level difficulty
    // Beginner -> Easy, Intermediate -> Medium, Advanced -> Hard
    let targetDifficulty: 'Easy' | 'Medium' | 'Hard' = 'Easy'
    if (lesson.difficulty === 'Intermediate') {
      targetDifficulty = 'Medium'
    } else if (lesson.difficulty === 'Advanced') {
      targetDifficulty = 'Hard'
    }
    
    // Check if target difficulty exists, otherwise use first available
    const available = lesson.levels.map(l => l.difficulty)
    if (available.includes(targetDifficulty)) {
      setDifficulty(targetDifficulty)
    } else if (available.length > 0) {
      // Use first available difficulty
      setDifficulty(available[0] as 'Easy' | 'Medium' | 'Hard')
    }
  }, [])

  // Get available difficulties from database levels
  const availableDifficulties = useMemo(() => {
    if (!dbLevels.length) return []
    const difficulties = new Set(dbLevels.map(l => l.difficulty))
    return Array.from(difficulties).sort((a, b) => {
      const order = { Easy: 0, Medium: 1, Hard: 2 }
      return order[a as keyof typeof order] - order[b as keyof typeof order]
    }) as ('Easy' | 'Medium' | 'Hard')[]
  }, [dbLevels])

  // Auto-select appropriate difficulty when levels are loaded (only if not set by algorithm)
  useEffect(() => {
    if (availableDifficulties.length > 0 && !availableDifficulties.includes(selectedDifficulty)) {
      // If dbLesson exists, use lesson difficulty to determine starting difficulty
      if (dbLesson) {
        setInitialDifficultyForLesson(dbLesson, setSelectedDifficulty)
      } else {
      setSelectedDifficulty(availableDifficulties[0])
    }
    }
  }, [availableDifficulties, selectedDifficulty, dbLesson])

  // Fetch lesson from database - try lessonIdParam first, then courseId + topicSlug, then find by language
  useEffect(() => {
    const fetchLesson = async () => {
      setIsLoadingLesson(true)
      try {
        let lesson: Lesson | null = null
        let actualCourseId = courseId
        
        // Map language slug to course name
        const langSlugToCourseName = (slug: string): string => {
          const mapping: Record<string, string> = {
            python: 'Python',
            csharp: 'C#',
            javascript: 'JavaScript',
            js: 'JavaScript',
            cpp: 'C++',
            'c++': 'C++',
            php: 'PHP',
            mysql: 'MySQL'
          }
          return mapping[slug.toLowerCase()] || slug
        }
        
        // First, try to load by lessonIdParam if provided
        if (lessonIdParam) {
          lesson = await getLessonById(lessonIdParam)
          if (lesson) {
            console.log('📚 Loaded database lesson by ID:', {
              id: lesson.id,
              title: lesson.title,
              courseId: lesson.courseId,
              levelsCount: lesson.levels?.length || 0,
              activeLang,
              langKey
            })
            actualCourseId = lesson.courseId
          }
        }
        
        // If no lesson found, try to find course by language and load lessons
        if (!lesson && activeLang) {
          const { getAllCourses, getLessonsByCourseId } = await import('../utils/courseManager')
          const courseName = langSlugToCourseName(activeLang)
          
          // Find course matching the language
          const allCourses = await getAllCourses()
          const matchingCourse = allCourses.find(c => 
            c.name.toLowerCase() === courseName.toLowerCase() || 
            c.id.toLowerCase() === activeLang.toLowerCase()
          )
          
          if (matchingCourse) {
            actualCourseId = matchingCourse.id
            console.log('📚 Found course by language:', { courseName, courseId: actualCourseId, activeLang, langKey })
            
            // Try to load from the courseId in URL first (if provided)
            if (courseId) {
              const courseLessons = await getLessonsByCourseId(courseId)
              if (courseLessons.length > 0) {
                // Verify this course matches the language
                const course = allCourses.find(c => c.id === courseId)
                if (course && course.name.toLowerCase() === courseName.toLowerCase()) {
                  // Use lessons from URL courseId
                  const lessons = courseLessons
                  
                  // Try to match by topicSlug first, otherwise use first lesson
                  if (topicSlug) {
                    const topicMatch = lessons.find(l => {
                      const lessonSlug = l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                      return lessonSlug === topicSlug || l.title.toLowerCase().includes(topicSlug)
                    })
                    if (topicMatch) {
                      lesson = topicMatch
                      console.log('📚 Matched lesson by topicSlug:', { title: lesson.title, topicSlug })
                    }
                  }
                  
                  // If no topic match, use first lesson
                  if (!lesson && lessons.length > 0) {
                    lesson = lessons[0]
                    console.log('📚 Using first lesson from course:', { title: lesson.title, totalLessons: lessons.length })
                  }
                }
              }
            }
            
            // If still no lesson, try loading from the language-matched course
            if (!lesson) {
              const courseLessons = await getLessonsByCourseId(actualCourseId)
              
              if (courseLessons.length > 0) {
                // Try to match by topicSlug first, otherwise use first lesson
                if (topicSlug) {
                  const topicMatch = courseLessons.find(l => {
                    const lessonSlug = l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                    return lessonSlug === topicSlug || l.title.toLowerCase().includes(topicSlug)
                  })
                  if (topicMatch) {
                    lesson = topicMatch
                    console.log('📚 Matched lesson by topicSlug from language course:', { title: lesson.title, topicSlug })
                  }
                }
                
                // If no topic match, use first lesson
                if (!lesson) {
                  lesson = courseLessons[0]
                  console.log('📚 Using first lesson from language-matched course:', { title: lesson.title, totalLessons: courseLessons.length, courseName })
                }
              } else {
                console.warn('⚠️ No lessons found for course:', { courseId: actualCourseId, courseName, activeLang })
              }
            }
          } else {
            console.warn('⚠️ No course found for language:', { activeLang, langKey, courseName })
          }
        }
        
        // Fallback: If no lesson found and we have courseId, try to load from course
        if (!lesson && courseId && !activeLang) {
          console.log('📚 No lesson ID provided, loading from course:', { courseId, topicSlug, activeLang, langKey })
          const { getLessonsByCourseId } = await import('../utils/courseManager')
          const courseLessons = await getLessonsByCourseId(courseId)
          
          if (courseLessons.length > 0) {
            // Try to match by topicSlug first, otherwise use first lesson
            if (topicSlug) {
              const topicMatch = courseLessons.find(l => {
                const lessonSlug = l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                return lessonSlug === topicSlug || l.title.toLowerCase().includes(topicSlug)
              })
              if (topicMatch) {
                lesson = topicMatch
                console.log('📚 Matched lesson by topicSlug:', { title: lesson.title, topicSlug })
              }
            }
            
            // If no topic match, use first lesson
            if (!lesson) {
              lesson = courseLessons[0]
              console.log('📚 Using first lesson from course:', { title: lesson.title, totalLessons: courseLessons.length })
            }
          }
        }
        
        if (lesson) {
          console.log('📚 Lesson loaded successfully:', {
            id: lesson.id,
            title: lesson.title,
            courseId: lesson.courseId,
            levelsCount: lesson.levels?.length || 0,
            levels: lesson.levels?.map(l => ({
              id: l.id,
              levelNumber: l.levelNumber,
              difficulty: l.difficulty,
              title: l.title,
              hasInitialCode: !!l.initialCode && l.initialCode.trim().length > 0,
              initialCodeLength: l.initialCode?.length || 0
            })) || []
          })
          
          setDbLesson(lesson)
          const levels = lesson.levels || []
          setDbLevels(levels)
          
          // Log if levels are empty or missing initialCode
          if (levels.length === 0) {
            console.warn('⚠️ Lesson has no levels:', { lessonId: lesson.id, lessonTitle: lesson.title })
          } else {
            const levelsWithCode = levels.filter(l => l.initialCode && l.initialCode.trim().length > 0)
            if (levelsWithCode.length === 0) {
              console.warn('⚠️ Lesson has levels but none have initialCode:', {
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                totalLevels: levels.length,
                levels: levels.map(l => ({ levelNumber: l.levelNumber, difficulty: l.difficulty, hasCode: !!l.initialCode }))
              })
            } else {
              console.log('✅ Found levels with code:', {
                totalLevels: levels.length,
                levelsWithCode: levelsWithCode.length,
                levels: levelsWithCode.map(l => ({ levelNumber: l.levelNumber, difficulty: l.difficulty }))
              })
            }
          }
          
          // For Level 1, always use lesson's default difficulty (don't use preferred_difficulty)
          // Preferred difficulty should only apply to subsequent levels after student has made progress
          // This ensures students start with the correct difficulty for the lesson
          setInitialDifficultyForLesson(lesson, setSelectedDifficulty)
          
          // Get algorithm's preferred difficulty for future levels (but don't apply it to Level 1)
          // This will be used when advancing to next levels
          if (lesson.id) {
            try {
              const preferredResult = await api.getPreferredDifficulty(lesson.id)
              if (preferredResult.success && preferredResult.preferredDifficulty) {
                const preferred = preferredResult.preferredDifficulty as 'Easy' | 'Medium' | 'Hard'
                // Store in ref for use when advancing levels (not for initial load)
                if (lesson.levels?.some(l => l.difficulty === preferred)) {
                  recommendedDifficultyRef.current = preferred
                }
              }
            } catch (error) {
              // Ignore - will use lesson default for Level 1
              console.log('No preferred difficulty found, using lesson default for Level 1')
            }
          }
        } else {
          console.warn('⚠️ No lesson found:', { lessonIdParam, courseId, topicSlug, activeLang, langKey })
          setDbLesson(null)
          setDbLevels([])
        }
      } catch (error) {
        console.error('Error fetching lesson:', error)
        setDbLesson(null)
        setDbLevels([])
      } finally {
        setIsLoadingLesson(false)
      }
    }

    fetchLesson()
  }, [lessonIdParam, courseId, topicSlug, activeLang, langKey])

  useEffect(() => {
    let isMounted = true
    const fetchStats = async () => {
      if (!user) return
      try {
        const result = await api.getUserStatistics()
        if (isMounted && result?.statistics) {
          setStudentExp(result.statistics.totalPoints ?? 0)
        }
      } catch (error) {
        console.error('Failed to load user statistics:', error)
      }
    }
    fetchStats()
    return () => {
      isMounted = false
    }
  }, [user])

  // Use database lesson if available, otherwise fall back to hardcoded lessons
  const selectedLesson = useMemo(() => {
    if (dbLesson) {
      // Convert database lesson to LessonDefinition format
      // Map lesson difficulty: Beginner -> Beginner, Intermediate -> Intermediate, Advanced -> Advanced
      const lessonDiff: Difficulty = dbLesson.difficulty === 'Beginner' ? 'Beginner' 
        : dbLesson.difficulty === 'Intermediate' ? 'Intermediate' 
        : dbLesson.difficulty === 'Advanced' ? 'Advanced' 
        : 'Beginner'
      return {
        title: dbLesson.title,
        difficulty: lessonDiff,
        slug: toSlug(dbLesson.title),
        blocks: [] // Will be set from level's initialCode
      }
    }
    
    const lessons = lessonLibrary[langKey] || []
    if (!lessons.length) return fallbackLesson
    if (!topicSlug) return lessons[0]
    const match = lessons.find((lesson) => lesson.slug === topicSlug)
    return match || lessons[0]
  }, [dbLesson, langKey, topicSlug])

  const requestedDifficulty = parseDifficulty(difficultyParam)

  const fallbackDeck = useMemo(() => {
    const lessons = lessonLibrary[langKey] || []
    const candidates = lessons.filter(lesson => lesson.slug === topicSlug || toSlug(lesson.title) === topicSlug)
    const baseLesson = candidates[0] || selectedLesson || fallbackLesson
    return buildDeckForLesson(baseLesson, langKey, SYNTAX_LEVEL_COUNT)
  }, [fallbackLesson, langKey, selectedLesson, topicSlug])

  const levelNumberSequence = useMemo(() => {
    if (dbLevels.length > 0) {
      return Array.from(new Set(dbLevels.map((lvl) => lvl.levelNumber))).sort((a, b) => a - b)
    }
    return Array.from({ length: fallbackDeck.length || SYNTAX_LEVEL_COUNT }, (_, idx) => idx + 1)
  }, [dbLevels, fallbackDeck])

  type DeckEntry = {
    lesson: LessonDefinition
    sourceLevel: Level | null
    levelNumber: number
  }

  const deckEntries = useMemo<DeckEntry[]>(() => {
    if (dbLesson && dbLevels.length > 0) {
      const grouped = new Map<number, Level[]>()
      dbLevels.forEach((level) => {
        if (!grouped.has(level.levelNumber)) {
          grouped.set(level.levelNumber, [])
        }
        grouped.get(level.levelNumber)!.push(level)
      })

      const preferredLessonDifficulty =
        dbLesson.difficulty === 'Intermediate'
          ? 'Medium'
          : dbLesson.difficulty === 'Advanced'
            ? 'Hard'
            : 'Easy'

      const entries = levelNumberSequence.map((levelNumber, idx) => {
        const variants = grouped.get(levelNumber) ?? []
        const targetDifficulty = recommendedDifficultyRef.current || selectedDifficulty
        const preferredVariant =
          variants.find((variant) => variant.difficulty === targetDifficulty) ||
          variants.find((variant) => variant.difficulty === preferredLessonDifficulty) ||
          variants[0] ||
          null

        if (preferredVariant) {
          const hasCode = preferredVariant.initialCode && preferredVariant.initialCode.trim().length > 0
          if (!hasCode) {
            console.warn('⚠️ Level variant has no initialCode:', {
              levelNumber,
              difficulty: preferredVariant.difficulty,
              levelId: preferredVariant.id,
              title: preferredVariant.title
            })
          }
          
          return {
            levelNumber,
            sourceLevel: preferredVariant,
            lesson: {
              title: preferredVariant.title || dbLesson.title,
              difficulty:
                preferredVariant.difficulty === 'Easy'
                  ? 'Beginner'
                  : preferredVariant.difficulty === 'Medium'
                    ? 'Intermediate'
                    : 'Advanced',
              slug: toSlug(preferredVariant.title || dbLesson.title),
              blocks: preferredVariant.initialCode ? toLines(preferredVariant.initialCode) : []
            }
          }
        }

        console.warn('⚠️ No variant found for level:', {
          levelNumber,
          availableVariants: variants.map(v => ({ difficulty: v.difficulty, hasCode: !!v.initialCode })),
          targetDifficulty,
          preferredLessonDifficulty
        })

        return {
          levelNumber,
          sourceLevel: null,
          lesson: fallbackDeck[idx % fallbackDeck.length]
        }
      })
      
      console.log('📦 Deck entries created:', {
        totalEntries: entries.length,
        entriesWithSource: entries.filter(e => e.sourceLevel).length,
        entriesWithoutSource: entries.filter(e => !e.sourceLevel).length,
        firstEntry: entries[0] ? {
          levelNumber: entries[0].levelNumber,
          hasSource: !!entries[0].sourceLevel,
          hasBlocks: entries[0].lesson.blocks.length > 0
        } : null
      })
      
      return entries
    }

    console.warn('⚠️ Using fallback deck - no dbLesson or dbLevels:', {
      hasDbLesson: !!dbLesson,
      dbLevelsCount: dbLevels.length,
      levelNumberSequenceLength: levelNumberSequence.length
    })

    return levelNumberSequence.map((levelNumber, idx) => ({
      levelNumber,
      sourceLevel: null,
      lesson: fallbackDeck[idx % fallbackDeck.length]
    }))
  }, [dbLesson, dbLevels, fallbackDeck, levelNumberSequence, selectedDifficulty, difficultyUpdateTrigger])

  const topicDeck = useMemo(() => deckEntries.map((entry) => entry.lesson), [deckEntries])

  const [level, setLevel] = useState(1)
  const derivedDeckLength = deckEntries.length > 0 ? deckEntries.length : (fallbackDeck.length || SYNTAX_LEVEL_COUNT)
  const maxLevels = Math.max(1, derivedDeckLength)

  const currentLesson = useMemo(() => {
    if (!topicDeck.length) return selectedLesson
    const index = Math.min(level - 1, topicDeck.length - 1)
    return topicDeck[index] || selectedLesson
  }, [topicDeck, level, selectedLesson])

  const currentDbLevel = useMemo(() => {
    if (!deckEntries.length) return null
    const index = Math.min(level - 1, deckEntries.length - 1)
    const dbLevel = deckEntries[index]?.sourceLevel || null
    return dbLevel
  }, [deckEntries, level])
  
  // Debug logging for currentDbLevel
  useEffect(() => {
    console.log('🔍 Current DB Level changed:', {
      level,
      currentDbLevel: currentDbLevel ? {
        id: currentDbLevel.id,
        levelNumber: currentDbLevel.levelNumber,
        difficulty: currentDbLevel.difficulty,
        title: currentDbLevel.title,
        hasInitialCode: !!currentDbLevel.initialCode && currentDbLevel.initialCode.trim().length > 0,
        initialCodePreview: currentDbLevel.initialCode?.substring(0, 50) || 'N/A'
      } : null,
      deckEntriesLength: deckEntries.length,
      selectedDifficulty
    })
  }, [currentDbLevel, level, deckEntries.length, selectedDifficulty])

  useEffect(() => {
    setHintUnlockLevel(0)
    setPendingHintPurchase(null)
  }, [level, selectedDifficulty, currentDbLevel?.id])

  useEffect(() => {
    return () => {
      if (hintResolverRef.current) {
        hintResolverRef.current(false)
        hintResolverRef.current = null
      }
    }
  }, [])

  const resolveHintPromise = useCallback((value: boolean) => {
    if (hintResolverRef.current) {
      hintResolverRef.current(value)
      hintResolverRef.current = null
    }
  }, [])

  const handleHintRequest = useCallback(async (level: 1 | 2 | 3, cost: number) => {
    if (level <= hintUnlockLevel) {
      return true
    }
    setPendingHintPurchase({ level, cost })
    setHintModalState({ open: true, loading: false, error: '' })
    return await new Promise<boolean>((resolve) => {
      hintResolverRef.current = resolve
    })
  }, [hintUnlockLevel])

  const handleCancelHintPurchase = useCallback(() => {
    setHintModalState({ open: false, loading: false, error: '' })
    setPendingHintPurchase(null)
    resolveHintPromise(false)
  }, [resolveHintPromise])

  const handleConfirmHintPurchase = useCallback(async () => {
    if (!pendingHintPurchase) {
      resolveHintPromise(false)
      return
    }
    setHintModalState(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await api.purchaseHint({ level: pendingHintPurchase.level, cost: pendingHintPurchase.cost })
      setHintUnlockLevel(pendingHintPurchase.level)
      if (typeof response?.remainingExp === 'number') {
        setStudentExp(response.remainingExp)
      }
      setHintModalState({ open: false, loading: false, error: '' })
      setPendingHintPurchase(null)
      resolveHintPromise(true)
    } catch (error: any) {
      const message = error?.response?.error || error.message || 'Failed to unlock hint. Please try again.'
      setHintModalState(prev => ({ ...prev, loading: false, error: message }))
    }
  }, [pendingHintPurchase, resolveHintPromise])

  const lessonDifficulty: Difficulty = requestedDifficulty || currentLesson.difficulty

  const randomExtras = useMemo(() => {
    const extraCount = lessonDifficulty === 'Beginner' ? 1 : lessonDifficulty === 'Intermediate' ? 2 : 3
    const basePool = languageNoise[langKey] || languageNoise.default
    const filtered = basePool.filter(line => !(currentLesson.blocks || []).includes(line))
    const pool = filtered.length ? filtered : languageNoise.default
    return { count: extraCount, pool }
  }, [langKey, lessonDifficulty, currentLesson])

  // Use initialCode from database level if available
  const lessonBlocks = useMemo(() => {
    // Priority 1: Database level's initialCode (most reliable)
    if (currentDbLevel?.initialCode) {
      const code = currentDbLevel.initialCode.trim()
      if (code.length > 0) {
        const blocks = toLines(code)
      if (blocks.length > 0) {
          console.log('✅ Using database level blocks:', {
          levelId: currentDbLevel.id,
          levelNumber: currentDbLevel.levelNumber,
          difficulty: currentDbLevel.difficulty,
          blocksCount: blocks.length,
          langKey,
          activeLang,
            preview: blocks.slice(0, 3)
        })
        return blocks
      } else {
          console.warn('⚠️ Database level initialCode produced no blocks after parsing:', {
          levelId: currentDbLevel.id,
            levelNumber: currentDbLevel.levelNumber,
            codeLength: code.length,
            codePreview: code.substring(0, 100)
          })
        }
      } else {
        console.warn('⚠️ Database level has empty/whitespace-only initialCode:', {
          levelId: currentDbLevel.id,
          levelNumber: currentDbLevel.levelNumber,
          difficulty: currentDbLevel.difficulty
        })
      }
    } else if (currentDbLevel) {
      console.warn('⚠️ Database level exists but has no initialCode property:', {
        levelId: currentDbLevel.id,
        levelNumber: currentDbLevel.levelNumber,
        difficulty: currentDbLevel.difficulty,
        hasInitialCode: 'initialCode' in currentDbLevel,
        levelKeys: Object.keys(currentDbLevel)
      })
    }
    
    // Priority 1.5: Use deck entry's lesson blocks if available (fallback when currentDbLevel not ready yet)
    // This helps with timing issues when level changes after submission
    if (deckEntries.length > 0) {
      const index = Math.min(level - 1, deckEntries.length - 1)
      const deckEntry = deckEntries[index]
      if (deckEntry?.lesson?.blocks && deckEntry.lesson.blocks.length > 0) {
        console.log('✅ Using deck entry lesson blocks (fallback):', {
          levelNumber: deckEntry.levelNumber,
          blocksCount: deckEntry.lesson.blocks.length,
          hasSourceLevel: !!deckEntry.sourceLevel,
          langKey
        })
        return deckEntry.lesson.blocks
      }
    }
    
    // Priority 2: Check if we have dbLesson but no levels yet (still loading)
    if (dbLesson && dbLevels.length === 0) {
      console.log('⏳ Database lesson loaded but levels not yet available, waiting...', {
        lessonId: dbLesson.id,
        lessonTitle: dbLesson.title
      })
      return [] // Return empty to wait for levels to load
    }
    
    // Priority 3: Hardcoded lesson blocks (should not be used if database lesson exists)
    if (currentLesson.blocks && currentLesson.blocks.length) {
      console.warn('⚠️ Using currentLesson blocks (hardcoded fallback):', {
        lessonTitle: currentLesson.title,
        blocksCount: currentLesson.blocks.length,
        langKey,
        hasDbLesson: !!dbLesson
      })
      return currentLesson.blocks
    }
    if (selectedLesson.blocks.length) {
      console.warn('⚠️ Using selectedLesson blocks (hardcoded fallback):', {
        lessonTitle: selectedLesson.title,
        blocksCount: selectedLesson.blocks.length,
        langKey,
        hasDbLesson: !!dbLesson
      })
      return selectedLesson.blocks
    }
    
    // Last resort: fallback lesson (should never happen with database lessons)
    console.error('❌ No blocks found anywhere! Using fallbackLesson:', { 
      langKey, 
      activeLang,
      hasDbLesson: !!dbLesson,
      hasDbLevels: dbLevels.length > 0,
      currentDbLevel: currentDbLevel?.id
    })
    return fallbackLesson.blocks
  }, [currentDbLevel, currentLesson, selectedLesson, langKey, activeLang, dbLesson, dbLevels, deckEntries, level])

  // Create a stable key that only changes when level, difficulty, or lesson actually changes
  // Use lessonId to ensure we don't remount when just the level data refreshes
  // Include currentDbLevel?.id to ensure we remount when the actual level data changes
  // Include lessonBlocks.length to force remount when blocks become available
  const jigsawKey = useMemo(
    () => {
      const hasBlocks = lessonBlocks.length > 0
      const levelId = currentDbLevel?.id || dbLesson?.id || lessonIdParam || 'fallback'
      return `jigsaw-${level}-${selectedDifficulty}-${levelId}-${activeLang}-${hasBlocks ? 'ready' : 'empty'}`
    },
    [level, selectedDifficulty, currentDbLevel?.id, dbLesson?.id, lessonIdParam, activeLang, lessonBlocks.length]
  )
  
  // Debug: Log lessonBlocks before rendering
  useEffect(() => {
    if (lessonBlocks.length > 0) {
      console.log('✅ lessonBlocks ready for render:', {
        length: lessonBlocks.length,
        preview: lessonBlocks.slice(0, 3),
        jigsawKey,
        currentDbLevel: currentDbLevel?.id
      })
    } else {
      console.warn('⚠️ lessonBlocks is empty, will show loading/empty state:', {
        hasDbLesson: !!dbLesson,
        isLoadingLesson,
        currentDbLevel: currentDbLevel?.id,
        dbLevelsCount: dbLevels.length
      })
    }
  }, [lessonBlocks, jigsawKey, currentDbLevel?.id, dbLesson, isLoadingLesson, dbLevels.length])

  // Debug: Track when lessonBlocks changes
  useEffect(() => {
    console.log('🔄 lessonBlocks changed:', {
      length: lessonBlocks.length,
      preview: lessonBlocks.slice(0, 3),
      currentDbLevel: currentDbLevel?.id,
      level,
      jigsawKey,
      blocksContent: lessonBlocks.map((b, i) => ({ index: i, length: b.length, preview: b.substring(0, 50), isEmpty: !b.trim() }))
    })
  }, [lessonBlocks, currentDbLevel?.id, level, jigsawKey])

  // Generate contextual hint based on code blocks (helpful but not too revealing)
  const generateHint = useCallback((blocks: string[], language: string, difficulty: string): string => {
    if (!blocks || blocks.length === 0) {
      return "Look at the code blocks and think about how they should be arranged logically."
    }

    const blockCount = blocks.length
    const normalizedBlocks = blocks.map(b => b.trim().toLowerCase())

    // Analyze code patterns (without revealing specific solutions)
    const hasLoop = normalizedBlocks.some(b => /^\s*for\s+|^\s*while\s+|foreach/i.test(b))
    const hasConditional = normalizedBlocks.some(b => /^\s*if\s+|^\s*else\s+|^\s*elif/i.test(b))
    const hasFunction = normalizedBlocks.some(b => /^\s*def\s+|^\s*function\s+|^\s*fn\s+/i.test(b))
    const hasVariable = normalizedBlocks.some(b => /\w+\s*=\s*[^=]/.test(b) && !hasLoop && !hasFunction)
    const hasPrint = normalizedBlocks.some(b => /print\s*\(|console\.log/i.test(b))
    const hasReturn = normalizedBlocks.some(b => /return\s+/.test(b))
    const hasIndentation = blocks.some(b => /^\s{2,}/.test(b))

    // Count different types
    const variableCount = normalizedBlocks.filter(b => /\w+\s*=\s*[^=]/.test(b) && !hasLoop && !hasFunction).length
    const loopCount = normalizedBlocks.filter(b => /^\s*for\s+|^\s*while\s+/i.test(b)).length

    // Generate progressive hints based on difficulty and code structure
    // Hints are designed to guide without giving away the solution
    if (difficulty === 'Easy' || difficulty === 'Beginner') {
      // For loops with variables
      if (hasLoop && variableCount > 0) {
        return "Some blocks set up values that the loop needs. Consider which blocks should come before the loop declaration."
      }
      // For loops with print
      if (hasLoop && hasPrint) {
        return "Loops repeat code. Consider which block should be inside the loop structure - look for blocks that reference the loop variable."
      }
      // For variables with print
      if (variableCount > 0 && hasPrint && !hasLoop) {
        return "Variables are created before they're used. Consider the order: define first, then use."
      }
      // For simple loops
      if (hasLoop && blockCount <= 4) {
        return "Loops have a structure: the loop declaration comes first, then the code that runs inside it."
      }
      // For simple sequences
      if (blockCount <= 3 && !hasLoop && !hasConditional) {
        return "Think about what needs to happen first. Which block sets up something that another block needs?"
      }
      // Default for beginners
      return "Start with blocks that set up initial values or conditions. Then think about what should happen next in the sequence."
    } else if (difficulty === 'Medium' || difficulty === 'Intermediate') {
      // For nested structures
      if (hasLoop && hasConditional) {
        return "One structure wraps the other. Think about which one is the container and which belongs inside it."
      }
      // For functions
      if (hasFunction && hasPrint) {
        return "Functions are defined before they're used. Consider where the function definition should be relative to other code."
      }
      // For complex loops
      if (hasLoop && variableCount > 1) {
        return "Some variables set up the loop, others are used inside it. Identify which variables control the loop's behavior."
      }
      // For indentation clues
      if (hasIndentation) {
        return "Indentation shows structure. Blocks with more indentation typically belong inside other blocks."
      }
      // Default for intermediate
      return "Look for dependencies: some blocks need values from others. Identify which blocks must come first."
    } else {
      // Hard/Advanced - more abstract hints
      if (hasFunction && hasLoop && hasConditional) {
        return "Complex code has layers. Function definitions come first, then control structures. Consider execution flow and scope."
      }
      if (hasLoop && hasConditional) {
        return "Nested structures have a hierarchy. The outer structure wraps the inner one. Think about which code belongs at each level."
      }
      if (hasReturn && hasFunction) {
        return "Return statements belong inside functions. Consider the function's purpose and what it should return."
      }
      // Default for advanced
      return "Break down the problem into parts. Identify independent operations and dependent ones. Consider data flow and execution order."
    }
  }, [])

  const contextualHint = useMemo(() => {
    return generateHint(lessonBlocks, activeLang || 'python', selectedDifficulty)
  }, [lessonBlocks, activeLang, selectedDifficulty, generateHint])

  // Track per-level status for progress bar: 'pending' | 'completed' | 'skipped'
  const [levelStatuses, setLevelStatuses] = useState<Array<'pending' | 'completed' | 'skipped'>>([])
  const completionHandledRef = useRef(false)
  const [showLessonCompletePopup, setShowLessonCompletePopup] = useState(false)
  
  // Track EXP gained per level
  const [expGainedForLevel, setExpGainedForLevel] = useState<number | null>(null)
  const [showExpNotification, setShowExpNotification] = useState(false)
  
  // Track total EXP gained in current lesson (cumulative across all completed levels)
  const [totalExpGainedInLesson, setTotalExpGainedInLesson] = useState<number>(0)

  const persistLessonExpSnapshot = useCallback(
    (lastLevelExp: number, totalLessonExp: number) => {
      if (!lessonIdParam || !userId) {
        return
      }
      try {
        const cacheKey = getLessonExpCacheKey(userId)
        const raw = localStorage.getItem(cacheKey)
        const parsed: Record<string, LessonExpCacheEntry> = raw ? JSON.parse(raw) : {}
        parsed[lessonIdParam] = {
          lastLevelExp: Number.isFinite(lastLevelExp) ? Math.max(0, lastLevelExp) : 0,
          totalLessonExp: Number.isFinite(totalLessonExp) ? Math.max(0, totalLessonExp) : 0,
          updatedAt: Date.now()
        }
        localStorage.setItem(cacheKey, JSON.stringify(parsed))
      } catch {
        // Ignore cache errors
      }
    },
    [lessonIdParam, userId]
  )

  useEffect(() => {
    if (!lessonIdParam || !userId) {
      setExpGainedForLevel(null)
      setTotalExpGainedInLesson(0)
      return
    }
    try {
      const cacheKey = getLessonExpCacheKey(userId)
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const parsed: Record<string, LessonExpCacheEntry> = JSON.parse(raw)
        const entry = parsed?.[lessonIdParam]
        if (entry) {
          setExpGainedForLevel(
            Number.isFinite(entry.lastLevelExp) ? entry.lastLevelExp : null
          )
          setTotalExpGainedInLesson(
            Number.isFinite(entry.totalLessonExp) ? entry.totalLessonExp : 0
          )
          return
        }
      }
    } catch {
      // Ignore cache errors
    }
    setExpGainedForLevel(null)
    setTotalExpGainedInLesson(0)
  }, [lessonIdParam, userId])

  // Countdown timer (auto-start 10 minutes per level)
  const initialSeconds = 10 * 60
  const [seconds, setSeconds] = useState(initialSeconds)
  const [running, setRunning] = useState(true)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (running) {
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            // stop at 0
            setRunning(false)
            return 0
          }
          return s - 1
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [running])

  // Track level start time for attempt duration calculation
  const levelStartTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    setLevel(1)
    setLevelStatuses(Array.from({ length: maxLevels }, () => 'pending'))
    setSeconds(initialSeconds)
    setRunning(true)
    levelStartTimeRef.current = Date.now()
    completionHandledRef.current = false
    // Clear recommended difficulty ref when lesson changes
    recommendedDifficultyRef.current = null
    // Reset EXP tracking when lesson changes
    setTotalExpGainedInLesson(0)
  }, [langKey, topicSlug, maxLevels, initialSeconds, lessonIdParam])

  const updateLocalProgressCache = useCallback((completed: number, completedLevels?: number[]) => {
    if (!lessonIdParam || !userId) return
    const total = maxLevels
    const cacheKey = getProgressCacheKey(userId)
    const normalizedCompletedLevels = Array.isArray(completedLevels)
      ? Array.from(
          new Set(
            completedLevels
              .map(level => Number(level))
              .filter(level => Number.isFinite(level) && level >= 1)
          )
        ).sort((a, b) => a - b)
      : undefined
    try {
      const raw = sessionStorage.getItem(cacheKey)
      const parsed: Record<string, LessonProgressCacheEntry> = raw ? JSON.parse(raw) : {}
      parsed[lessonIdParam] = {
        completed,
        total,
        completedLevels: normalizedCompletedLevels,
        updatedAt: Date.now()
      }
      sessionStorage.setItem(cacheKey, JSON.stringify(parsed))
    } catch {
      // ignore cache errors
    }
    window.dispatchEvent(
      new CustomEvent<{
        lessonId: string
        progress: { completed?: number; total?: number; completedLevels?: number[] }
      }>('lesson-progress-updated', {
        detail: {
          lessonId: lessonIdParam,
          progress: {
            completed,
            total,
            completedLevels: normalizedCompletedLevels
          }
        }
      })
    )
  }, [lessonIdParam, maxLevels, userId])

  const broadcastLessonProgress = useCallback(async () => {
    if (!lessonIdParam) {
      return null
    }
    try {
      const latestProgress = await api.getLessonProgress(lessonIdParam)
      if (typeof latestProgress?.completed === 'number') {
        const normalizedCompletedLevels = Array.isArray(latestProgress.completedLevels)
          ? latestProgress.completedLevels
              .map((level: number) => Number(level))
              .filter(level => Number.isFinite(level) && level >= 1)
          : undefined
        updateLocalProgressCache(
          Math.min(latestProgress.completed, maxLevels),
          normalizedCompletedLevels
        )
      }
      return latestProgress
    } catch (progressError) {
      console.error('Error refreshing lesson progress:', progressError)
      return null
    }
  }, [lessonIdParam, maxLevels, updateLocalProgressCache])

  useEffect(() => {
    let isMounted = true
    const hydrateProgress = async () => {
      if (!lessonIdParam || !dbLevels.length || !userId) {
        return
      }
      const latest = await broadcastLessonProgress()
      if (!isMounted) return
      const localCompletedLevels = levelStatuses
        .map((status, idx) => status === 'completed' ? idx + 1 : null)
        .filter((levelNumber): levelNumber is number => levelNumber !== null)

      let cachedCompleted = 0
      let cachedCompletedLevels: number[] = []
      if (lessonIdParam && userId) {
        try {
          const cacheKey = getProgressCacheKey(userId)
          const raw = sessionStorage.getItem(cacheKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            const entry = parsed?.[lessonIdParam]
            if (entry && typeof entry.completed === 'number') {
              cachedCompleted = entry.completed
            }
            if (entry && Array.isArray(entry.completedLevels)) {
              cachedCompletedLevels = entry.completedLevels
                .map((level: number) => Number(level))
                .filter((level: number) => Number.isFinite(level) && level >= 1)
            }
          }
        } catch {
          cachedCompleted = 0
        }
      }
      const latestCompletedLevels = Array.isArray(latest?.completedLevels)
        ? latest.completedLevels
            .map((level: number) => Number(level))
            .filter((level: number) => Number.isFinite(level) && level >= 1)
        : []
      if (!latestCompletedLevels.length && typeof latest?.completed === 'number' && latest.completed > 0) {
        latestCompletedLevels.push(
          ...Array.from({ length: latest.completed }, (_, idx) => idx + 1)
        )
      }
      if (!cachedCompletedLevels.length && cachedCompleted > 0) {
        cachedCompletedLevels = Array.from({ length: cachedCompleted }, (_, idx) => idx + 1)
      }
      const combinedCompletedLevels = Array.from(
        new Set([
          ...localCompletedLevels,
          ...cachedCompletedLevels,
          ...latestCompletedLevels
        ].filter(level => Number.isFinite(level) && level >= 1 && level <= maxLevels))
      ).sort((a, b) => a - b)

      const statuses = Array.from({ length: maxLevels }, (_, idx) => {
        const levelNumber = idx + 1
        if (combinedCompletedLevels.includes(levelNumber)) {
          return 'completed'
        }
        const previousStatus = levelStatuses[idx]
        return previousStatus === 'skipped' ? 'skipped' : 'pending'
      }) as Array<'pending' | 'completed' | 'skipped'>
      setLevelStatuses(prev => {
        if (
          prev.length === statuses.length &&
          prev.every((status, idx) => status === statuses[idx])
        ) {
          return prev
        }
        return statuses
      })
      // Find the first level that is NOT completed
      // This ensures we don't skip over levels that were skipped but not completed
      let desiredLevel = 1
      for (let levelNum = 1; levelNum <= maxLevels; levelNum++) {
        if (!combinedCompletedLevels.includes(levelNum)) {
          desiredLevel = levelNum
          break
        }
      }
      // If all levels are completed, go to the last level
      if (combinedCompletedLevels.length >= maxLevels) {
        desiredLevel = maxLevels
      }
      
      // Only update level if we found a valid incomplete level
      // Don't force update if current level is already correct or higher
      setLevel(prevLevel => {
        // If current level is already at or past the desired level, keep it
        // This prevents jumping backwards unnecessarily
        if (prevLevel >= desiredLevel && prevLevel <= maxLevels) {
          return prevLevel
        }
        return desiredLevel
      })
    }
    hydrateProgress()

    return () => {
      isMounted = false
    }
  }, [lessonIdParam, dbLevels, maxLevels, broadcastLessonProgress, levelStatuses, userId])

  // Reset start time when level changes
  useEffect(() => {
    levelStartTimeRef.current = Date.now()
  }, [level])

  const mmss = useMemo(() => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    return `${pad(m)}:${pad(s)}`
  }, [seconds])

  const isLastLevel = level >= maxLevels
  const completedLevelsCount = useMemo(
    () => levelStatuses.filter(status => status === 'completed').length,
    [levelStatuses]
  )

  const lastLevelExpDisplay = useMemo(() => {
    if (typeof expGainedForLevel === 'number' && expGainedForLevel >= 0) {
      return expGainedForLevel
    }
    if (completedLevelsCount > 0) {
      return LESSON_EXP_PER_LEVEL_UI
    }
    return 0
  }, [expGainedForLevel, completedLevelsCount])

  const totalLessonExpDisplay = useMemo(() => {
    const fallback = completedLevelsCount * LESSON_EXP_PER_LEVEL_UI
    return Math.max(totalExpGainedInLesson, fallback)
  }, [completedLevelsCount, totalExpGainedInLesson])

  const goBackToLessons = useCallback(() => {
    navigate(`/dashboard/student/courses${activeLang ? `?lang=${activeLang}` : ''}`)
  }, [navigate, activeLang])

  const handleLessonCompletion = useCallback(async () => {
    if (completionHandledRef.current) {
      return
    }
    completionHandledRef.current = true

    setRunning(false)
    setSeconds(0)

    await broadcastLessonProgress()

    // Show completion popup
    setShowLessonCompletePopup(true)

    // Auto-close popup and navigate immediately (no delay for better UX)
    setTimeout(() => {
      setShowLessonCompletePopup(false)
      goBackToLessons()
      completionHandledRef.current = false
    }, 2000) // Reduced to 2 seconds for faster exit
  }, [goBackToLessons, broadcastLessonProgress])

  // Basic metadata
  const meta = useMemo(() => {
    const title = dbLesson?.title || currentLesson.title || selectedLesson.title || 'Lesson Title'
    const description = dbLesson?.description || `Solve the ${title.toLowerCase()} challenge. Progress from Level 1 to Level ${maxLevels}.`
    return {
      title,
      description
    }
  }, [dbLesson, currentLesson.title, selectedLesson.title, maxLevels])


  if (isLoadingLesson) {
    return (
      <div className="course-player" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: '#9ca3af' }}>Loading lesson...</div>
      </div>
    )
  }

  if (lessonIdParam && !dbLesson) {
    return (
      <div className="course-player" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: 16 }}>Lesson not found</div>
        <button className="btn-secondary" onClick={() => navigate(`/dashboard/student/courses${activeLang ? `?lang=${activeLang}` : ''}`)}>
          ⟵ Back to Lessons
        </button>
      </div>
    )
  }

  if (lessonIdParam && dbLevels.length === 0) {
    return (
      <div className="course-player" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: '#9ca3af', marginBottom: 16 }}>No levels available for this lesson yet.</div>
        <button className="btn-secondary" onClick={() => navigate(`/dashboard/student/courses${activeLang ? `?lang=${activeLang}` : ''}`)}>
          ⟵ Back to Lessons
        </button>
      </div>
    )
  }

  return (
    <div className="course-player">
      {/* Lesson Completion Popup - Character Centered Design */}
      {showLessonCompletePopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
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
            {Array.from({ length: 100 }).map((_, i) => (
              <div
                key={i}
                className="confetti"
                style={{
                  position: 'absolute',
                  width: `${Math.random() * 14 + 7}px`,
                  height: `${Math.random() * 14 + 7}px`,
                  backgroundColor: ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3'][Math.floor(Math.random() * 12)],
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
            {/* Large Animated Robot Character */}
            <div style={{
              position: 'relative',
              display: 'inline-block',
              animation: 'robotCelebrate 2.5s ease-in-out infinite',
              marginBottom: 50
            }}>
              {/* Robot Character Design - Enhanced with mechanical animations */}
              <div style={{
                position: 'relative',
                fontSize: 220,
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
                  {/* Celebration effects around robot */}
                  <span style={{
                    position: 'absolute',
                    top: '-30px',
                    right: '-40px',
                    fontSize: 80,
                    animation: 'sparkle 1s ease-in-out infinite',
                    animationDelay: '0.2s'
                  }}>✨</span>
                  <span style={{
                    position: 'absolute',
                    top: '-20px',
                    left: '-40px',
                    fontSize: 70,
                    animation: 'sparkle 1s ease-in-out infinite',
                    animationDelay: '0.4s'
                  }}>⭐</span>
                  <span style={{
                    position: 'absolute',
                    bottom: '-30px',
                    right: '-30px',
                    fontSize: 75,
                    animation: 'sparkle 1s ease-in-out infinite',
                    animationDelay: '0.6s'
                  }}>🎉</span>
                  <span style={{
                    position: 'absolute',
                    bottom: '-20px',
                    left: '-30px',
                    fontSize: 65,
                    animation: 'sparkle 1s ease-in-out infinite',
                    animationDelay: '0.8s'
                  }}>🏆</span>
                </div>
              </div>
              
              {/* Orbiting Stars around character */}
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
                    filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.9))'
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
              padding: '28px 42px',
              borderRadius: 32,
              boxShadow: '0 15px 50px rgba(0, 0, 0, 0.5), 0 0 0 3px rgba(255, 255, 255, 0.4)',
              fontSize: 32,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              animation: 'speechBubblePop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s both',
              marginBottom: 60,
              minWidth: '320px',
              border: '4px solid rgba(102, 126, 234, 0.4)'
            }}>
              <div style={{
                position: 'absolute',
                bottom: '-20px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '20px solid transparent',
                borderRight: '20px solid transparent',
                borderTop: '20px solid #ffffff',
                filter: 'drop-shadow(0 5px 10px rgba(0, 0, 0, 0.3))'
              }} />
              <span style={{ 
                animation: 'textWave 0.6s ease-in-out 1s both',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                Incredible Achievement! 🎉
              </span>
            </div>

            {/* Success Message - Floating text */}
            <div style={{
              position: 'relative',
              zIndex: 1,
              animation: 'slideInUp 0.8s ease-out 0.6s both'
            }}>
              <h2 style={{
                fontSize: 56,
                fontWeight: 900,
                color: 'white',
                margin: '0 0 20px 0',
                textShadow: '0 5px 25px rgba(0, 0, 0, 0.6), 0 0 40px rgba(102, 126, 234, 0.7)',
                letterSpacing: '2px'
              }}>
                Lesson Complete! 🏆
              </h2>
              <p style={{
                fontSize: 26,
                color: 'rgba(255, 255, 255, 0.98)',
                margin: '0 0 16px 0',
                fontWeight: 600,
                textShadow: '0 3px 15px rgba(0, 0, 0, 0.5)'
              }}>
                You have completed the Whole lesson!
              </p>
              <p style={{
                fontSize: 20,
                color: 'rgba(255, 255, 255, 0.9)',
                margin: '0 0 0 0',
                fontWeight: 500,
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.4)'
              }}>
                {meta.title}
              </p>
            </div>

            {/* Exit Message */}
            <div style={{
              fontSize: 18,
              color: 'rgba(255, 255, 255, 0.85)',
              marginTop: 50,
              padding: '16px 32px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              animation: 'fadeInUp 0.8s ease-out 0.8s both',
              position: 'relative',
              zIndex: 1
            }}>
              <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
                Returning to lessons...
              </span>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
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
        @keyframes starOrbit {
          0% {
            transform: translate(-50%, -50%) rotate(0deg) translateY(-150px) rotate(0deg);
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
            transform: translate(-50%, -50%) rotate(360deg) translateY(-150px) rotate(-360deg);
            opacity: 0.7;
            scale: 0.8;
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
        @keyframes starSpin {
          0% {
            transform: translate(-50%, -50%) rotate(0deg) translateY(-100px) rotate(0deg);
            opacity: 0;
            scale: 0;
          }
          50% {
            opacity: 1;
            scale: 1;
          }
          100% {
            transform: translate(-50%, -50%) rotate(360deg) translateY(-100px) rotate(-360deg);
            opacity: 0.8;
            scale: 0.9;
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
      `}</style>
      {/* Top info strip: title/description/level/timer */}
      <div className="lesson-card" style={{ marginBottom: 16 }}>
        <div className="lesson-card-body" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{meta.title}</div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{meta.description}</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Level {level} of {maxLevels}</div>
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Difficulty: {dbLesson?.difficulty || lessonDifficulty}</span>
              {/* Dropdown removed - difficulty is now automatically adjusted by algorithm */}
            </div>
            {levelStatuses.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span>Progress: {completedLevelsCount}/{Math.max(maxLevels, levelStatuses.length)} completed</span>
                  {showExpNotification && expGainedForLevel !== null && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#4ade80',
                      animation: 'fadeIn 0.3s ease-in'
                    }}>
                      <span>⭐</span>
                      <span>+{expGainedForLevel} EXP</span>
                    </div>
                  )}
                </div>
                {/* EXP Meter - Total EXP gained in this lesson */}
                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    marginBottom: 4,
                    fontSize: 12,
                    opacity: 0.85
                  }}>
                    <span style={{ fontWeight: 600, color: '#fbbf24' }}>⭐</span>
                    <span style={{ fontWeight: 500 }}>Total EXP Gained:</span>
                    <span style={{ 
                      fontWeight: 700, 
                      color: '#fbbf24',
                      fontSize: 13
                    }}>{totalLessonExpDisplay} EXP</span>
                  </div>
                  {/* Visual EXP meter bar */}
                  <div style={{
                    width: '100%',
                    height: 8,
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 9999,
                    overflow: 'hidden',
                    position: 'relative',
                    border: '1px solid rgba(255, 255, 255, 0.15)'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, (totalLessonExpDisplay / (maxLevels * LESSON_EXP_PER_LEVEL_UI)) * 100)}%`,
                      background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                      borderRadius: 9999,
                      transition: 'width 0.5s ease-out',
                      boxShadow: '0 0 8px rgba(251, 191, 36, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingRight: 4
                    }}>
                      {totalLessonExpDisplay > 0 && (
                        <div style={{
                          width: 4,
                          height: 4,
                          background: 'rgba(255, 255, 255, 0.8)',
                          borderRadius: '50%',
                          boxShadow: '0 0 4px rgba(255, 255, 255, 0.6)'
                        }} />
                      )}
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: 10, 
                    opacity: 0.6, 
                    marginTop: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>Last level EXP: +{lastLevelExpDisplay} EXP</span>
                    <span>Total: {totalLessonExpDisplay} / {maxLevels * LESSON_EXP_PER_LEVEL_UI} EXP</span>
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.max(levelStatuses.length, 1)}, minmax(12px, 1fr))`,
                    gap: 6
                  }}
                >
                  {levelStatuses.map((status, idx) => {
                    const isActive = idx === level - 1
                    const background =
                      status === 'completed'
                        ? '#22c55e'
                        : status === 'skipped'
                          ? '#f97316'
                          : '#1f2937'
                    const border =
                      status === 'completed'
                        ? '1px solid #22c55e'
                        : status === 'skipped'
                          ? '1px solid rgba(249, 115, 22, 0.65)'
                          : '1px solid rgba(255,255,255,0.14)'
                    return (
                      <div
                        key={idx}
                        style={{
                          height: 10,
                          borderRadius: 9999,
                          background,
                          border,
                          boxShadow: isActive ? '0 0 0 1px rgba(255,255,255,0.35)' : 'none',
                          transition: 'background 180ms ease, box-shadow 180ms ease'
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="puzzle-block" style={{ padding: '8px 12px' }}>⏱ {mmss}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={async () => {
              // Mark current as skipped if not completed yet
              setLevelStatuses(prev => {
                const copy = [...prev]
                const idx = level - 1
                if (copy[idx] !== 'completed') copy[idx] = 'skipped'
                return copy
              })
              await broadcastLessonProgress()
              goBackToLessons()
            }}>⟵ Back</button>
            {!isLastLevel && (
              <button
                className="btn-primary"
                onClick={() => {
                  setLevel((l) => {
                    const next = Math.min(maxLevels, l + 1)
                    return next
                  })
                  // Deduct 1 minute instead of resetting timer
                  setSeconds((s) => Math.max(0, s - 60))
                  setRunning(true)
                  // Mark current level as skipped if not completed
                  setLevelStatuses(prev => {
                    const copy = [...prev]
                    const idx = level - 1
                    if (copy[idx] !== 'completed') copy[idx] = 'skipped'
                    return copy
                  })
                }}
              >
                Skip ▶
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Jigsaw code blocks workspace */}
      <JigsawCodePuzzle
        key={jigsawKey}
        height={520}
        initialTexts={lessonBlocks}
        randomExtras={randomExtras}
        language={langKey}
        currentLevel={level}
        difficulty={selectedDifficulty}
        hint={contextualHint}
        onHintRequest={handleHintRequest}
        isLastLevel={isLastLevel}
        achievements={currentAchievements}
        onSubmitResult={async (status, code) => {
          const isSuccess = status === 'success'
          let statusesAfterUpdate = levelStatuses
          const previousLevel = level
          let nextLevelTarget: number | null = null
          const currentIndex = Math.max(0, Math.min(levelStatuses.length - 1, level - 1))
          
          // Update UI immediately
          if (isSuccess) {
            setLevelStatuses(prev => {
              const copy = [...prev]
              if (currentIndex >= 0 && currentIndex < copy.length) {
                copy[currentIndex] = 'completed'
              }
              const completedCount = copy.filter(status => status === 'completed').length
              const completedLevelNumbers = copy
                .map((status, idx) => status === 'completed' ? idx + 1 : null)
                .filter((levelNumber): levelNumber is number => levelNumber !== null)
              updateLocalProgressCache(completedCount, completedLevelNumbers)
              statusesAfterUpdate = copy
              nextLevelTarget = Math.min(maxLevels, Math.max(1, completedCount + 1))
              return copy
            })
          }

          const completedCountAfterUpdate = statusesAfterUpdate.filter(status => status === 'completed').length
          const allCompleted = completedCountAfterUpdate >= maxLevels && maxLevels > 0
          const shouldAutoComplete = isSuccess && allCompleted
          
          // Debug logging for completion detection
          console.log('📊 Level completion check:', {
            isSuccess,
            isLastLevel,
            previousLevel,
            maxLevels,
            completedCountAfterUpdate,
            statusesAfterUpdateLength: statusesAfterUpdate.length,
            allCompleted,
            shouldAutoComplete
          })
          
          // Early check: If this is the last level and all levels are now completed, handle completion immediately
          if (isSuccess && isLastLevel && allCompleted) {
            console.log('🎉 Last level completed! All levels finished. Will show lesson completion popup after API call.')
          }
          const computedFallback = nextLevelTarget ?? Math.min(
            maxLevels,
            Math.max(1, completedCountAfterUpdate + 1)
          )
          const fallbackTargetLevel = isSuccess
            ? Math.max(
                Math.min(maxLevels, previousLevel + 1),
                computedFallback
              )
            : computedFallback

          // Don't advance if this is the last level and all are completed
          if (isSuccess && !shouldAutoComplete && !isLastLevel && fallbackTargetLevel > previousLevel) {
            setLevel((currentLevel) =>
              currentLevel >= fallbackTargetLevel ? currentLevel : fallbackTargetLevel
            )
          }

          // Submit puzzle attempt to backend for algorithm processing
          console.log('🔍 Puzzle submission check:', {
            currentDbLevel: currentDbLevel?.id,
            dbLesson: dbLesson?.id,
            level: level,
            isSuccess,
            dbLevelsCount: dbLevels.length,
            deckEntriesCount: deckEntries.length
          })

          if (currentDbLevel?.id) {
            try {
              const attemptTime = Math.floor((Date.now() - levelStartTimeRef.current) / 1000) // Convert to seconds
              const expectedOutput = currentDbLevel.expectedOutput || ''
              
              console.log('📤 Submitting puzzle attempt:', {
                levelId: currentDbLevel.id,
                lessonId: dbLesson?.id,
                success: isSuccess,
                attemptTime
              })
              
              const result = await api.submitPuzzleAttempt({
                levelId: currentDbLevel.id,
                lessonId: dbLesson?.id,
                success: isSuccess,
                attemptTime: attemptTime,
                codeSubmitted: code || null, // Capture the actual code from JigsawCodePuzzle
                expectedOutput: expectedOutput,
                actualOutput: isSuccess ? expectedOutput : null
              })

              console.log('✅ Puzzle attempt submitted successfully:', result)

              // Extract and set achievements if any were unlocked
              if (isSuccess && result.result?.achievements?.unlocked) {
                const unlockedAchievements = result.result.achievements.unlocked.map((ach: any) => ({
                  title: ach.name || ach.title || 'Achievement Unlocked!',
                  description: ach.description || 'Great job!',
                  icon: ach.icon || '🏆',
                  expReward: ach.expReward || 0
                }));
                setCurrentAchievements(unlockedAchievements);
              } else {
                setCurrentAchievements([]);
              }

              // Display EXP gained if level was completed successfully
              if (isSuccess && result.result?.exp) {
                const expPayload = result.result.exp
                const totalGained = expPayload.gained ?? 0
                const achievementBonus = expPayload.achievementReward ?? 0
                const baseExp = totalGained - achievementBonus
                const normalizedBase = baseExp >= 0 ? baseExp : totalGained
                setExpGainedForLevel(normalizedBase)
                setShowExpNotification(true)
                
                // Update cumulative EXP for this lesson
                setTotalExpGainedInLesson(prev => {
                  const nextTotal = prev + normalizedBase
                  persistLessonExpSnapshot(normalizedBase, nextTotal)
                  return nextTotal
                })
                
                // Update student EXP display
                if (expPayload.total !== undefined) {
                  setStudentExp(expPayload.total)
                }
              }

              // Broadcast latest progress so other views stay in sync
              await broadcastLessonProgress()

              // Algorithm always provides a recommendation for next puzzle
              // CRITICAL: Update difficulty BEFORE advancing to next level
              let recommendedDifficulty: 'Easy' | 'Medium' | 'Hard' | null = null
              let nextLevelIdFromBackend: string | null = null
              
              if (isSuccess) {
                if (result.result?.newDifficulty) {
                  const newDifficulty = result.result.newDifficulty as 'Easy' | 'Medium' | 'Hard'
                  
                  // Backend may have already found the next level ID (when difficultySwitched is true)
                  if (result.result?.difficultySwitched && result.result?.levelId) {
                    nextLevelIdFromBackend = result.result.levelId
                    console.log(`✅ Backend found next level ID: ${nextLevelIdFromBackend} (${newDifficulty})`)
                  }
                  
                  // Update selected difficulty to match algorithm's suggestion
                  if (availableDifficulties.includes(newDifficulty)) {
                    recommendedDifficulty = newDifficulty
                    // Store in ref for immediate use (bypasses React state batching)
                    recommendedDifficultyRef.current = newDifficulty
                    setSelectedDifficulty(newDifficulty)
                    // Force memo to recompute with new difficulty
                    setDifficultyUpdateTrigger(prev => prev + 1)
                    console.log(`🎯 Algorithm recommends ${newDifficulty} difficulty for next level`)
                    
                    // Always refresh lesson data to get latest levels
                    if (lessonIdParam) {
                      const updatedLesson = await getLessonById(lessonIdParam)
                      if (updatedLesson) {
                        setDbLesson(updatedLesson)
                        setDbLevels(updatedLesson.levels || [])
                        console.log(`🔄 Refreshed lesson data. Total levels: ${updatedLesson.levels?.length || 0}`)
                      }
                    }
                    
                    if (result.result?.difficultySwitched) {
                      console.log(`Difficulty adjusted by algorithm: ${result.result.oldDifficulty} → ${newDifficulty}`)
                    }
                  } else {
                    console.warn(`Algorithm recommended ${newDifficulty} but it's not available. Available: ${availableDifficulties.join(', ')}`)
                  }
                }
                
                // Also check preferred_difficulty from API for next level (as backup)
                if (lessonIdParam && !recommendedDifficulty) {
                  try {
                    const preferredResult = await api.getPreferredDifficulty(lessonIdParam)
                    if (preferredResult.success && preferredResult.preferredDifficulty) {
                      const preferred = preferredResult.preferredDifficulty as 'Easy' | 'Medium' | 'Hard'
                      if (availableDifficulties.includes(preferred)) {
                        recommendedDifficulty = preferred
                        recommendedDifficultyRef.current = preferred
                        setSelectedDifficulty(preferred)
                        // Force memo to recompute with new difficulty
                        setDifficultyUpdateTrigger(prev => prev + 1)
                        console.log(`📝 Using preferred difficulty from database: ${preferred}`)
                      }
                    }
                  } catch (error) {
                    console.error('Error fetching preferred difficulty:', error)
                  }
                }
                
                // Clear EXP notification when advancing to next level (after showing it for a bit)
                setTimeout(() => {
                  setShowExpNotification(false)
                }, 3000) // Clear after 3 seconds
              }
              
              // Advance to next level on success, AFTER difficulty is updated
              // Don't advance if this is the last level and all are completed
              if (isSuccess && !shouldAutoComplete && !isLastLevel) {
                // If backend provided a specific level ID, use it directly
                if (nextLevelIdFromBackend) {
                  // Filter levels by the recommended difficulty to find the correct level number
                  const targetLevel = dbLevels.find((lvl) => lvl.id === nextLevelIdFromBackend)
                  if (targetLevel) {
                    const resolvedIndex = levelNumberSequence.findIndex((num) => num === targetLevel.levelNumber)
                    const targetLevelPosition = resolvedIndex >= 0 ? resolvedIndex + 1 : Math.min(maxLevels, targetLevel.levelNumber)
                    console.log(`🎯 Using backend-provided level ID: Level ${targetLevel.levelNumber} (${targetLevel.difficulty})`)
                    console.log(`📊 Advancing to position ${targetLevelPosition} within ordered level numbers`)
                    
                    setTimeout(() => {
                      setLevel(targetLevelPosition)
                      console.log(`➡️ Advanced to Level ${targetLevelPosition} (${targetLevel.difficulty}) using backend-provided ID`)
                    }, 0)
                  } else {
                    console.warn(`Backend provided level ID ${nextLevelIdFromBackend} but it was not found in dbLevels`)
                    // Fallback to normal level advancement
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        setLevel((currentLevel) => {
                          const difficultyBeingUsed = recommendedDifficultyRef.current || selectedDifficulty
                          if (Number.isFinite(fallbackTargetLevel)) {
                            console.log(`➡️ Advancing to Level ${fallbackTargetLevel} with difficulty: ${difficultyBeingUsed}`)
                            return fallbackTargetLevel
                          }
                          const nextLevelValue = Math.min(maxLevels, currentLevel + 1)
                          console.log(`➡️ Advancing to Level ${nextLevelValue} with difficulty: ${difficultyBeingUsed}`)
                          return nextLevelValue
                        })
                      })
                    })
                  }
                } else {
                  // No specific level ID from backend, use normal advancement
                  setTimeout(() => {
                    setLevel((currentLevel) => {
                      const difficultyBeingUsed = recommendedDifficultyRef.current || selectedDifficulty
                      if (Number.isFinite(fallbackTargetLevel)) {
                        console.log(`➡️ Advancing to Level ${fallbackTargetLevel} with difficulty: ${difficultyBeingUsed}`)
                        console.log(`📊 Available levels for ${difficultyBeingUsed}:`, 
                          dbLevels.filter(l => l.difficulty === difficultyBeingUsed).map(l => `Level ${l.levelNumber}`).join(', '))
                        return fallbackTargetLevel
                      }
                      const nextLevel = Math.min(maxLevels, currentLevel + 1)
                      console.log(`➡️ Advancing to Level ${nextLevel} with difficulty: ${difficultyBeingUsed}`)
                      console.log(`📊 Available levels for ${difficultyBeingUsed}:`, 
                        dbLevels.filter(l => l.difficulty === difficultyBeingUsed).map(l => `Level ${l.levelNumber}`).join(', '))
                      return nextLevel
                    })
                  }, 0)
                }
              }
            } catch (error) {
              console.error('❌ Error submitting puzzle attempt:', error)
              console.error('Error details:', {
                message: (error as any)?.message,
                status: (error as any)?.status,
                response: (error as any)?.response
              })
              // Don't block UI if API call fails, but still advance level (unless it's the last level)
              if (isSuccess && !isLastLevel) {
                setLevel((l) => Math.min(maxLevels, l + 1))
              }
            }
          } else {
            console.warn('⚠️ No API call made - currentDbLevel is missing:', {
              currentDbLevel,
              dbLevels: dbLevels.length,
            deckEntries: deckEntries.length,
              level,
              selectedDifficulty
            })
            // If no API call was made, still advance level on success (unless it's the last level)
            if (isSuccess && !shouldAutoComplete && !isLastLevel) {
              setLevel((l) => Math.min(maxLevels, l + 1))
            }
          }

          // Handle lesson completion if all levels are done
          if (shouldAutoComplete) {
            console.log('✅ All levels completed! Triggering lesson completion popup.')
            await handleLessonCompletion()
            return
          }
          
          // Additional check: If we just completed the last level and all are done, show completion
          // This handles cases where shouldAutoComplete might not have been set correctly
          if (isSuccess && isLastLevel && completedCountAfterUpdate >= maxLevels) {
            console.log('🎯 Last level completion detected. All levels finished. Showing completion popup.')
            await handleLessonCompletion()
            return
          }
        }}
      />
      {hintModalState.open && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Use Hint?</h3>
            <p style={{ lineHeight: 1.6 }}>
              Viewing this hint costs{' '}
              <strong>{pendingHintPurchase?.cost ?? HINT_EXP_COSTS[1]} EXP</strong>.
              This deduction cannot be undone.
            </p>
            <p style={{ color: '#a1a1aa', marginBottom: 16 }}>
              Current EXP:{' '}
              <strong>{studentExp !== null ? studentExp : 'loading...'}</strong>
            </p>
            {hintModalState.error && (
              <div style={{ color: '#f87171', marginBottom: 12 }}>
                {hintModalState.error}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={handleCancelHintPurchase}
                disabled={hintModalState.loading}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirmHintPurchase}
                disabled={hintModalState.loading}
              >
                {hintModalState.loading
                  ? 'Processing...'
                  : `Spend ${pendingHintPurchase?.cost ?? HINT_EXP_COSTS[1]} EXP`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
