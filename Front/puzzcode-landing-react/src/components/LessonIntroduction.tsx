import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import { getLessonsByCourseId, type Lesson } from '../utils/courseManager'

export default function LessonIntroduction() {
  const navigate = useNavigate()
  const { courseId } = useParams<{ courseId: string }>()
  const [searchParams] = useSearchParams()
  const lessonId = searchParams.get('lesson')
  const activeLang = searchParams.get('lang') || 'python'
  const topicSlug = searchParams.get('topic') || ''

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalLevels, setTotalLevels] = useState<number>(10)

  useEffect(() => {
    const fetchLesson = async () => {
      if (!courseId || !lessonId) {
        setError('Missing course or lesson ID')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        // Fetch lesson details from API
        const lessonData = await api.getLesson(lessonId)
        
        if (lessonData) {
          setLesson(lessonData)
          // Get level count from lesson data
          if (lessonData.levels && lessonData.levels.length > 0) {
            const uniqueLevels = new Set(lessonData.levels.map(l => l.levelNumber))
            setTotalLevels(uniqueLevels.size || 10)
          } else {
            // Try to get level count from progress API
            try {
              const progress = await api.getLessonProgress(lessonId)
              setTotalLevels(progress.total || 10)
            } catch {
              setTotalLevels(10) // Default
            }
          }
        } else {
          // Fallback: try fetching from course lessons
          const lessons = await getLessonsByCourseId(courseId)
          const foundLesson = lessons.find(l => l.id === lessonId)
          
          if (foundLesson) {
            setLesson(foundLesson)
            if (foundLesson.levels && foundLesson.levels.length > 0) {
              const uniqueLevels = new Set(foundLesson.levels.map(l => l.levelNumber))
              setTotalLevels(uniqueLevels.size || 10)
            }
          } else {
            setError('Lesson not found')
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch lesson:', err)
        // Fallback: try fetching from course lessons
        try {
          const lessons = await getLessonsByCourseId(courseId)
          const foundLesson = lessons.find(l => l.id === lessonId)
          if (foundLesson) {
            setLesson(foundLesson)
          } else {
            setError(err.message || 'Failed to load lesson')
          }
        } catch {
          setError(err.message || 'Failed to load lesson')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchLesson()
  }, [courseId, lessonId])

  const handleStartLesson = () => {
    if (!courseId || !lessonId) return
    navigate(`/dashboard/student/courses/${courseId}/play?lang=${activeLang}&lesson=${lessonId}&topic=${topicSlug}`)
  }

  const handleGoBack = () => {
    navigate(`/dashboard/student/courses${activeLang ? `?lang=${activeLang}` : ''}`)
  }

  // Generate educational examples based on lesson topic (different from actual level code)
  const getEducationalExamples = (): string => {
    if (!lesson) {
      return activeLang === 'python' 
        ? `# Example code will appear here`
        : `// Example code will appear here`
    }

    const title = lesson.title.toLowerCase()
    const description = (lesson.description || '').toLowerCase()
    const combinedText = `${title} ${description}`

    // Python examples
    if (activeLang === 'python') {
      if (combinedText.includes('variable') || combinedText.includes('syntax') || combinedText.includes('basic')) {
        return `# Variables and Basic Operations
# Learn how to store and use data
name = "Student"
age = 20
temperature = 25.5
is_active = True

# Display information
print(f"My name is {name}")
print(f"I am {age} years old")
print(f"Temperature: {temperature}°C")
print(f"Status: {'Active' if is_active else 'Inactive'}")

# Basic calculations
future_age = age + 5
average_temp = (temperature + 20) / 2
print(f"In 5 years, I'll be {future_age}")
print(f"Average temperature: {average_temp}°C")`
      } else if (combinedText.includes('list') || combinedText.includes('array') || combinedText.includes('collection')) {
        return `# Working with Lists
# Store multiple items in a list
subjects = ["Math", "Science", "English"]
scores = [95, 87, 92]

# Access list items
print(f"First subject: {subjects[0]}")
print(f"Total subjects: {len(subjects)}")

# Add new items
subjects.append("History")
print(f"All subjects: {subjects}")

# Calculate average score
average = sum(scores) / len(scores)
print(f"Average score: {average:.1f}")`
      } else if (combinedText.includes('dictionary') || combinedText.includes('dict') || combinedText.includes('key-value')) {
        return `# Working with Dictionaries
# Store data as key-value pairs
student = {
    "name": "Alex",
    "grade": "A",
    "subjects": ["Math", "Science"]
}

# Access dictionary values
print(f"Student: {student['name']}")
print(f"Grade: {student['grade']}")
print(f"Subjects: {student['subjects']}")

# Add new information
student["age"] = 18
student["city"] = "Manila"
print(f"Complete info: {student}")`
      } else if (combinedText.includes('loop') || combinedText.includes('iteration') || combinedText.includes('repeat')) {
        return `# Loops and Iteration
# Process multiple items with a loop
numbers = [10, 20, 30, 40, 50]
total = 0

# Loop through numbers
for num in numbers:
    total += num
    print(f"Adding {num}, total is now {total}")

print(f"Final total: {total}")

# Count items
count = 0
while count < 3:
    print(f"Count: {count}")
    count += 1`
      } else if (combinedText.includes('function') || combinedText.includes('def') || combinedText.includes('method')) {
        return `# Functions in Python
# Create reusable code blocks
def calculate_total(price, quantity):
    """Calculate total price"""
    return price * quantity

def greet_person(name, time_of_day="morning"):
    """Greet someone"""
    return f"Good {time_of_day}, {name}!"

# Use the functions
total1 = calculate_total(100, 3)
total2 = calculate_total(50, 5)
greeting = greet_person("Maria", "afternoon")

print(f"Total 1: {total1}")
print(f"Total 2: {total2}")
print(greeting)`
      } else if (combinedText.includes('string') || combinedText.includes('text') || combinedText.includes('char')) {
        return `# String Operations
# Work with text data
message = "Hello, Python!"

# String methods
print(f"Original: {message}")
print(f"Uppercase: {message.upper()}")
print(f"Lowercase: {message.lower()}")
print(f"Length: {len(message)} characters")

# String formatting
name = "World"
greeting = f"Hello, {name}!"
print(greeting)

# String slicing
print(f"First 5 chars: {message[:5]}")
print(f"Last 6 chars: {message[-6:]}")`
      } else if (combinedText.includes('condition') || combinedText.includes('if') || combinedText.includes('else')) {
        return `# Conditional Statements
# Make decisions in your code
score = 85
age = 18

# Simple if statement
if score >= 80:
    print("Great job! You passed!")

# If-else statement
if age >= 18:
    status = "Adult"
else:
    status = "Minor"
print(f"Status: {status}")

# Multiple conditions
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
else:
    grade = "C"
print(f"Grade: {grade}")`
      }
    }
    
    // JavaScript examples
    if (activeLang === 'javascript') {
      if (combinedText.includes('variable') || combinedText.includes('syntax') || combinedText.includes('basic')) {
        return `// Variables and Basic Operations
// Learn how to store and use data
let name = "Student";
const age = 20;
let temperature = 25.5;
const isActive = true;

// Display information
console.log(\`My name is \${name}\`);
console.log(\`I am \${age} years old\`);
console.log(\`Temperature: \${temperature}°C\`);
console.log(\`Status: \${isActive ? 'Active' : 'Inactive'}\`);

// Basic calculations
let futureAge = age + 5;
let averageTemp = (temperature + 20) / 2;
console.log(\`In 5 years, I'll be \${futureAge}\`);
console.log(\`Average temperature: \${averageTemp}°C\`);`
      } else if (combinedText.includes('array') || combinedText.includes('list') || combinedText.includes('collection')) {
        return `// Working with Arrays
// Store multiple items in an array
const subjects = ["Math", "Science", "English"];
const scores = [95, 87, 92];

// Access array items
console.log(\`First subject: \${subjects[0]}\`);
console.log(\`Total subjects: \${subjects.length}\`);

// Add new items
subjects.push("History");
console.log(\`All subjects: \${subjects}\`);

// Calculate average score
const sum = scores.reduce((a, b) => a + b, 0);
const average = sum / scores.length;
console.log(\`Average score: \${average.toFixed(1)}\`);`
      } else if (combinedText.includes('object') || combinedText.includes('key-value')) {
        return `// Working with Objects
// Store data as key-value pairs
const student = {
    name: "Alex",
    grade: "A",
    subjects: ["Math", "Science"]
};

// Access object properties
console.log(\`Student: \${student.name}\`);
console.log(\`Grade: \${student.grade}\`);
console.log(\`Subjects: \${student.subjects}\`);

// Add new properties
student.age = 18;
student.city = "Manila";
console.log(\`Complete info:\`, student);`
      } else if (combinedText.includes('loop') || combinedText.includes('iteration') || combinedText.includes('repeat')) {
        return `// Loops and Iteration
// Process multiple items with a loop
const numbers = [10, 20, 30, 40, 50];
let total = 0;

// Loop through numbers
for (let num of numbers) {
    total += num;
    console.log(\`Adding \${num}, total is now \${total}\`);
}

console.log(\`Final total: \${total}\`);

// While loop
let count = 0;
while (count < 3) {
    console.log(\`Count: \${count}\`);
    count++;
}`
      } else if (combinedText.includes('function') || combinedText.includes('method')) {
        return `// Functions in JavaScript
// Create reusable code blocks
function calculateTotal(price, quantity) {
    return price * quantity;
}

function greetPerson(name, timeOfDay = "morning") {
    return \`Good \${timeOfDay}, \${name}!\`;
}

// Use the functions
const total1 = calculateTotal(100, 3);
const total2 = calculateTotal(50, 5);
const greeting = greetPerson("Maria", "afternoon");

console.log(\`Total 1: \${total1}\`);
console.log(\`Total 2: \${total2}\`);
console.log(greeting);`
      }
    }

    // C# examples
    if (activeLang === 'csharp' || activeLang === 'c#' || activeLang === 'cs') {
      if (combinedText.includes('variable') || combinedText.includes('syntax') || combinedText.includes('basic') || combinedText.includes('type')) {
        return `// Variables and Basic Operations
// Learn how to store and use data
using System;

string name = "Student";
int age = 20;
double temperature = 25.5;
bool isActive = true;

// Display information
Console.WriteLine($"My name is {name}");
Console.WriteLine($"I am {age} years old");
Console.WriteLine($"Temperature: {temperature}°C");
Console.WriteLine($"Status: {(isActive ? "Active" : "Inactive")}");

// Basic calculations
int futureAge = age + 5;
double averageTemp = (temperature + 20) / 2;
Console.WriteLine($"In 5 years, I'll be {futureAge}");
Console.WriteLine($"Average temperature: {averageTemp}°C");`
      } else if (combinedText.includes('list') || combinedText.includes('array') || combinedText.includes('collection')) {
        return `// Working with Lists and Arrays
// Store multiple items in a list
using System;
using System.Collections.Generic;

var subjects = new List<string> { "Math", "Science", "English" };
int[] scores = { 95, 87, 92 };

// Access list items
Console.WriteLine($"First subject: {subjects[0]}");
Console.WriteLine($"Total subjects: {subjects.Count}");

// Add new items
subjects.Add("History");
Console.WriteLine($"All subjects: {string.Join(", ", subjects)}");

// Calculate average score
double average = scores.Average();
Console.WriteLine($"Average score: {average:F1}");`
      } else if (combinedText.includes('loop') || combinedText.includes('iteration') || combinedText.includes('repeat') || combinedText.includes('flow')) {
        return `// Loops and Iteration
// Process multiple items with a loop
using System;

int[] numbers = { 10, 20, 30, 40, 50 };
int total = 0;

// Loop through numbers
foreach (int num in numbers)
{
    total += num;
    Console.WriteLine($"Adding {num}, total is now {total}");
}

Console.WriteLine($"Final total: {total}");

// While loop
int count = 0;
while (count < 3)
{
    Console.WriteLine($"Count: {count}");
    count++;
}`
      } else if (combinedText.includes('function') || combinedText.includes('method') || combinedText.includes('class')) {
        return `// Methods and Classes
// Create reusable code blocks
using System;

class Calculator
{
    public int Add(int a, int b)
    {
        return a + b;
    }
    
    public string Greet(string name, string timeOfDay = "morning")
    {
        return $"Good {timeOfDay}, {name}!";
    }
}

// Use the class
var calc = new Calculator();
int result = calc.Add(10, 5);
string greeting = calc.Greet("Maria", "afternoon");

Console.WriteLine($"Result: {result}");
Console.WriteLine(greeting);`
      } else if (combinedText.includes('condition') || combinedText.includes('if') || combinedText.includes('else')) {
        return `// Conditional Statements
// Make decisions in your code
using System;

int score = 85;
int age = 18;

// Simple if statement
if (score >= 80)
{
    Console.WriteLine("Great job! You passed!");
}

// If-else statement
string status = age >= 18 ? "Adult" : "Minor";
Console.WriteLine($"Status: {status}");

// Multiple conditions
string grade;
if (score >= 90)
{
    grade = "A";
}
else if (score >= 80)
{
    grade = "B";
}
else
{
    grade = "C";
}
Console.WriteLine($"Grade: {grade}");`
      }
    }
    
    // Default educational example
    if (activeLang === 'python') {
      return `# Basic Python Example
# This lesson will teach you fundamental concepts
name = "Student"
age = 18
grades = [85, 90, 88]

# Calculate average
average = sum(grades) / len(grades)

# Display results
print(f"Name: {name}")
print(f"Age: {age}")
print(f"Grades: {grades}")
print(f"Average: {average:.1f}")

# Simple condition
if average >= 85:
    print("Excellent work!")`
    } else if (activeLang === 'javascript') {
      return `// Basic JavaScript Example
// This lesson will teach you fundamental concepts
const name = "Student";
const age = 18;
const grades = [85, 90, 88];

// Calculate average
const sum = grades.reduce((a, b) => a + b, 0);
const average = sum / grades.length;

// Display results
console.log(\`Name: \${name}\`);
console.log(\`Age: \${age}\`);
console.log(\`Grades: \${grades}\`);
console.log(\`Average: \${average.toFixed(1)}\`);

// Simple condition
if (average >= 85) {
    console.log("Excellent work!");
}`
    } else if (activeLang === 'csharp' || activeLang === 'c#' || activeLang === 'cs') {
      return `// Basic C# Example
// This lesson will teach you fundamental concepts
using System;

string name = "Student";
int age = 18;
int[] grades = { 85, 90, 88 };

// Calculate average
double average = grades.Average();

// Display results
Console.WriteLine($"Name: {name}");
Console.WriteLine($"Age: {age}");
Console.WriteLine($"Grades: [{string.Join(", ", grades)}]");
Console.WriteLine($"Average: {average:F1}");

// Simple condition
if (average >= 85)
{
    Console.WriteLine("Excellent work!");
}`
    } else {
      return `// Educational examples will appear here
// These examples demonstrate concepts you'll learn
// but are different from the actual puzzle code`
    }
  }

  // OLD FUNCTION - kept for reference but not used
  const getExampleCode_OLD = (lessonTitle: string, language: string): string => {
    const title = lessonTitle.toLowerCase()
    
    // Python examples
    if (language === 'python') {
      if (title.includes('variable') || title.includes('syntax') || title.includes('basic')) {
        return `# Variables and Basic Operations
name = "Alice"
age = 25
score = 85.5
is_passed = True

# Print variables
print(f"Name: {name}")
print(f"Age: {age}")
print(f"Score: {score}")

# Basic calculations
total = age + 10
average = score / 2
print(f"Age in 10 years: {total}")
print(f"Average: {average}")

# Conditional check
if is_passed:
    print("Congratulations! You passed!")`
      } else if (title.includes('list') || title.includes('dictionary') || title.includes('tuple') || title.includes('array')) {
        return `# Working with Lists and Dictionaries
# List of fruits
fruits = ["apple", "banana", "cherry"]
print(f"First fruit: {fruits[0]}")
print(f"Number of fruits: {len(fruits)}")

# Dictionary (key-value pairs)
student = {
    "name": "Bob",
    "age": 20,
    "grade": "A"
}

print(f"Student: {student['name']}")
print(f"Age: {student['age']}")
print(f"Grade: {student['grade']}")

# Add to list
fruits.append("orange")
print(f"All fruits: {fruits}")`
      } else if (title.includes('loop') || title.includes('control') || title.includes('iteration')) {
        return `# Loops and Control Flow
numbers = [1, 2, 3, 4, 5]
total = 0

# Loop through numbers
for num in numbers:
    if num % 2 == 0:
        total += num
        print(f"{num} is even, adding to total")
    else:
        print(f"{num} is odd, skipping")

print(f"Sum of even numbers: {total}")

# While loop example
count = 0
while count < 3:
    print(f"Count: {count}")
    count += 1`
      } else if (title.includes('function') || title.includes('method')) {
        return `# Functions in Python
def greet(name, greeting="Hello"):
    """Greet someone with a custom message"""
    return f"{greeting}, {name}!"

def calculate_area(length, width):
    """Calculate the area of a rectangle"""
    return length * width

# Use the functions
result1 = greet("Alice")
result2 = greet("Bob", "Hi")
area = calculate_area(5, 3)

print(result1)
print(result2)
print(f"Area: {area}")`
      } else if (title.includes('string') || title.includes('text')) {
        return `# String Operations
text = "Hello, World!"

# String methods
print(f"Original: {text}")
print(f"Uppercase: {text.upper()}")
print(f"Lowercase: {text.lower()}")
print(f"Length: {len(text)}")

# String formatting
name = "Python"
version = 3.11
message = f"Welcome to {name} {version}!"
print(message)

# String slicing
print(f"First 5 characters: {text[:5]}")
print(f"Last 6 characters: {text[-6:]}")`
      }
    }
    
    // JavaScript examples
    if (language === 'javascript') {
      if (title.includes('variable') || title.includes('syntax') || title.includes('basic')) {
        return `// Variables and Basic Operations
let name = "Alice";
const age = 25;
let score = 85.5;
const isPassed = true;

// Print variables
console.log(\`Name: \${name}\`);
console.log(\`Age: \${age}\`);
console.log(\`Score: \${score}\`);

// Basic calculations
let total = age + 10;
let average = score / 2;
console.log(\`Age in 10 years: \${total}\`);
console.log(\`Average: \${average}\`);

// Conditional check
if (isPassed) {
    console.log("Congratulations! You passed!");
}`
      } else if (title.includes('array') || title.includes('object') || title.includes('list')) {
        return `// Working with Arrays and Objects
// Array of fruits
const fruits = ["apple", "banana", "cherry"];
console.log(\`First fruit: \${fruits[0]}\`);
console.log(\`Number of fruits: \${fruits.length}\`);

// Object (key-value pairs)
const student = {
  name: "Bob",
    age: 20,
    grade: "A"
};

console.log(\`Student: \${student.name}\`);
console.log(\`Age: \${student.age}\`);
console.log(\`Grade: \${student.grade}\`);

// Add to array
fruits.push("orange");
console.log(\`All fruits: \${fruits}\`);`
      } else if (title.includes('loop') || title.includes('control') || title.includes('iteration')) {
        return `// Loops and Control Flow
const numbers = [1, 2, 3, 4, 5];
let total = 0;

// Loop through numbers
for (let num of numbers) {
    if (num % 2 === 0) {
        total += num;
        console.log(\`\${num} is even, adding to total\`);
    } else {
        console.log(\`\${num} is odd, skipping\`);
    }
}

console.log(\`Sum of even numbers: \${total}\`);

// While loop example
let count = 0;
while (count < 3) {
    console.log(\`Count: \${count}\`);
    count++;
}`
      } else if (title.includes('function') || title.includes('method')) {
        return `// Functions in JavaScript
function greet(name, greeting = "Hello") {
    return \`\${greeting}, \${name}!\`;
}

function calculateArea(length, width) {
    return length * width;
}

// Use the functions
const result1 = greet("Alice");
const result2 = greet("Bob", "Hi");
const area = calculateArea(5, 3);

console.log(result1);
console.log(result2);
console.log(\`Area: \${area}\`);`
      }
    }

    // Default example - always show real code
    if (language === 'python') {
      return `# Basic Python Example
# Store information
name = "Student"
age = 18
grades = [85, 90, 88]

# Calculate average
average = sum(grades) / len(grades)

# Display results
print(f"Name: {name}")
print(f"Age: {age}")
print(f"Grades: {grades}")
print(f"Average: {average:.1f}")

# Simple condition
if average >= 85:
    print("Excellent work!")`
    } else if (language === 'javascript') {
      return `// Basic JavaScript Example
// Store information
const name = "Student";
const age = 18;
const grades = [85, 90, 88];

// Calculate average
const sum = grades.reduce((a, b) => a + b, 0);
const average = sum / grades.length;

// Display results
console.log(\`Name: \${name}\`);
console.log(\`Age: \${age}\`);
console.log(\`Grades: \${grades}\`);
console.log(\`Average: \${average.toFixed(1)}\`);

// Simple condition
if (average >= 85) {
    console.log("Excellent work!");
}`
    } else {
      return `// Basic Programming Example
// This example demonstrates fundamental concepts
// you'll learn in this lesson`
    }
  }

  if (loading) {
    return (
      <div className="student-overview">
        <div style={{ textAlign: 'center', padding: '40px', color: '#eae6ff' }}>
          Loading lesson introduction...
        </div>
      </div>
    )
  }

  if (error || !lesson) {
    return (
      <div className="student-overview">
        <div style={{ textAlign: 'center', padding: '40px', color: '#eae6ff' }}>
          <div style={{ marginBottom: 16, color: '#f87171' }}>{error || 'Lesson not found'}</div>
          <button className="btn-secondary" onClick={handleGoBack}>
            ← Back to Lessons
          </button>
        </div>
      </div>
    )
  }

  const exampleCode = getEducationalExamples()

  // Generate level progression description based on actual levels - guide format
  const getLevelDescription = () => {
    if (!lesson || !lesson.levels || lesson.levels.length === 0) {
      return "This lesson is being prepared. Levels will be added soon to guide you through the concepts step by step."
    }

    const uniqueLevelNumbers = new Set(lesson.levels.map(l => l.levelNumber))
    const levelCount = uniqueLevelNumbers.size
    const levelsWithCode = lesson.levels.filter(l => l.initialCode && l.initialCode.trim().length > 0).length
    const difficultyCounts = {
      Easy: lesson.levels.filter(l => l.difficulty === 'Easy').length,
      Medium: lesson.levels.filter(l => l.difficulty === 'Medium').length,
      Hard: lesson.levels.filter(l => l.difficulty === 'Hard').length
    }

    // Get lesson topic for context
    const lessonTitle = lesson.title.toLowerCase()
    const topicKeywords = []
    if (lessonTitle.includes('variable') || lessonTitle.includes('syntax') || lessonTitle.includes('basic')) {
      topicKeywords.push('variables', 'data types', 'basic operations')
    } else if (lessonTitle.includes('list') || lessonTitle.includes('array')) {
      topicKeywords.push('collections', 'data structures')
    } else if (lessonTitle.includes('function')) {
      topicKeywords.push('functions', 'code organization')
    } else if (lessonTitle.includes('loop') || lessonTitle.includes('iteration')) {
      topicKeywords.push('loops', 'iteration')
    } else if (lessonTitle.includes('condition') || lessonTitle.includes('if')) {
      topicKeywords.push('conditional logic', 'decision making')
    }

    let description = `This lesson guides you through ${levelCount} main level${levelCount !== 1 ? 's' : ''}`
    
    if (topicKeywords.length > 0) {
      description += ` focused on ${topicKeywords.join(' and ')}.`
    } else {
      description += '.'
    }
    
    if (difficultyCounts.Easy > 0 || difficultyCounts.Medium > 0 || difficultyCounts.Hard > 0) {
      const difficulties = []
      if (difficultyCounts.Easy > 0) difficulties.push(`${difficultyCounts.Easy} Easy`)
      if (difficultyCounts.Medium > 0) difficulties.push(`${difficultyCounts.Medium} Medium`)
      if (difficultyCounts.Hard > 0) difficulties.push(`${difficultyCounts.Hard} Hard`)
      description += ` Each level offers ${difficulties.join(', ')} difficulty option${difficulties.length > 1 ? 's' : ''} to match your pace.`
    }

    description += ` Progress through each level to build your understanding step by step.`

    if (levelsWithCode > 0) {
      description += ` You'll practice with ${levelsWithCode} interactive coding exercise${levelsWithCode !== 1 ? 's' : ''} that reinforce the concepts.`
    }

    return description
  }

  // Generate discussion about a specific level and difficulty based on its actual content
  const getLevelDiscussion = (
    levelNumber: number,
    levelTitle: string,
    difficulty: string,
    initialCode?: string,
    levelDescription?: string
  ): string => {
    const trimmedDescription = levelDescription?.trim()
    if (trimmedDescription) {
      return trimmedDescription
    }

    const lessonTitle = lesson?.title?.toLowerCase() || ''
    const title = levelTitle.toLowerCase()
    const code = initialCode?.toLowerCase() || ''
    const combinedText = `${lessonTitle} ${title} ${code}`
    
    // Analyze the actual code content to determine what concepts are present
    const hasVariables = code.includes('=') && (code.includes('int') || code.includes('str') || code.includes('var') || code.match(/\w+\s*=\s*\w+/))
    const hasLists = code.includes('[') && code.includes(']') || code.includes('array') || code.includes('list')
    const hasDicts = code.includes('{') && code.includes('}') || code.includes('dict') || code.includes('key')
    const hasLoops = code.includes('for') || code.includes('while') || code.includes('loop')
    const hasFunctions = code.includes('def ') || code.includes('function') || code.includes('()')
    const hasStrings = code.includes('"') || code.includes("'") || code.includes('str')
    const hasConditions = code.includes('if ') || code.includes('else') || code.includes('switch')
    const hasMath = code.includes('+') || code.includes('-') || code.includes('*') || code.includes('/') || code.includes('math')
    
    // Difficulty-specific context
    const difficultyContext = difficulty === 'Easy' 
      ? 'This level focuses on fundamental concepts with straightforward examples.' 
      : difficulty === 'Medium'
      ? 'This level introduces more complexity while building on the basics.'
      : 'This level challenges you with advanced concepts and more intricate problems.'
    
    // Build discussion based on actual code content
    const concepts: string[] = []
    if (hasVariables) concepts.push('working with variables')
    if (hasLists) concepts.push('manipulating lists or arrays')
    if (hasDicts) concepts.push('using dictionaries or key-value structures')
    if (hasLoops) concepts.push('implementing loops')
    if (hasFunctions) concepts.push('creating and using functions')
    if (hasStrings) concepts.push('working with strings')
    if (hasConditions) concepts.push('making decisions with conditionals')
    if (hasMath) concepts.push('performing calculations')
    
    // If we can identify specific concepts from the code
    if (concepts.length > 0) {
      const conceptText = concepts.length === 1 
        ? concepts[0]
        : concepts.length === 2
        ? `${concepts[0]} and ${concepts[1]}`
        : `${concepts.slice(0, -1).join(', ')}, and ${concepts[concepts.length - 1]}`
      
      return `${difficultyContext} In this level, you'll practice ${conceptText}. The code you'll work with focuses specifically on these concepts, helping you understand how they work together.`
    }
    
    // Fallback: analyze by keywords if code analysis didn't find specific patterns
    if (combinedText.includes('variable') || combinedText.includes('syntax') || combinedText.includes('basic')) {
      return `${difficultyContext} In this level, you'll explore the fundamental building blocks of programming. You'll learn how to store information using variables and work with different types of data.`
    } else if (combinedText.includes('list') || combinedText.includes('array') || combinedText.includes('collection')) {
      return `${difficultyContext} This level introduces you to collections of data. You'll discover how to group related items together and work with them as a unit.`
    } else if (combinedText.includes('dictionary') || combinedText.includes('dict') || combinedText.includes('key-value')) {
      return `${difficultyContext} Here, you'll explore how to store and retrieve information using key-value pairs.`
    } else if (combinedText.includes('loop') || combinedText.includes('iteration') || combinedText.includes('repeat')) {
      return `${difficultyContext} This level focuses on repetition and automation. You'll learn how to perform the same action multiple times.`
    } else if (combinedText.includes('function') || combinedText.includes('def') || combinedText.includes('method')) {
      return `${difficultyContext} In this level, you'll discover how to create reusable blocks of code. Functions help you organize your code and avoid repetition.`
    } else if (combinedText.includes('string') || combinedText.includes('text') || combinedText.includes('char')) {
      return `${difficultyContext} This level explores working with text data. You'll learn how to manipulate, combine, and extract information from strings.`
    } else if (combinedText.includes('condition') || combinedText.includes('if') || combinedText.includes('else')) {
      return `${difficultyContext} Here, you'll learn to make decisions in your code. Conditional statements allow your program to choose different paths.`
    } else if (combinedText.includes('calculation') || combinedText.includes('math') || combinedText.includes('operation')) {
      return `${difficultyContext} This level focuses on performing calculations and mathematical operations. You'll learn how to combine values and work with numbers programmatically.`
    } else {
      // Generic discussion based on level number and difficulty
      if (levelNumber === 1) {
        return `${difficultyContext} This is your first step into the lesson. You'll start with foundational concepts that will build your understanding.`
      } else {
        return `${difficultyContext} In this level, you'll build upon what you've learned so far.`
      }
    }
  }

  // Get level titles for display with discussions - separate entries for each difficulty
  const getLevelTitles = () => {
    if (!lesson || !lesson.levels || lesson.levels.length === 0) return []
    
    // Create separate entries for each level-difficulty combination
    const levelEntries: Array<{ 
      number: number
      title: string
      difficulty: string
      hasCode: boolean
      discussion: string
      key: string
    }> = []
    
    lesson.levels.forEach(level => {
      let discussion = getLevelDiscussion(
        level.levelNumber, 
        level.title || `Level ${level.levelNumber}`,
        level.difficulty || 'Easy',
        level.initialCode,
        level.description
      )
      
      // Replace any points value in the description with 20 pts (all lesson levels give 20 EXP)
      // This handles both stored descriptions and generated ones
      discussion = discussion.replace(/\d+\s*pts/g, '20 pts')
      
      // Clean title to remove " - Easy Mode" or similar difficulty suffixes
      let cleanTitle = level.title || `Level ${level.levelNumber}`
      cleanTitle = cleanTitle.replace(/\s*-\s*(Easy|Medium|Hard)\s*Mode\s*/gi, '').trim()
      if (!cleanTitle) {
        cleanTitle = `Level ${level.levelNumber}`
      }
      
      levelEntries.push({
        number: level.levelNumber,
        title: cleanTitle,
        difficulty: level.difficulty || 'Easy',
        hasCode: !!(level.initialCode && level.initialCode.trim().length > 0),
        discussion: discussion,
        key: `${level.levelNumber}-${level.difficulty || 'Easy'}`
      })
    })
    
    // Sort by level number, then by difficulty (Easy, Medium, Hard)
    const difficultyOrder: Record<string, number> = { 'Easy': 1, 'Medium': 2, 'Hard': 3 }
    return levelEntries.sort((a, b) => {
      if (a.number !== b.number) return a.number - b.number
      return (difficultyOrder[a.difficulty] || 99) - (difficultyOrder[b.difficulty] || 99)
    })
  }

  return (
    <div className="student-overview">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{lesson.title}</h1>
          <p className="page-subtitle">Welcome! Get ready to master the fundamentals through interactive puzzles</p>
        </div>
        <button 
          className="btn-secondary" 
          onClick={handleGoBack}
          style={{ 
            padding: '10px 20px',
            whiteSpace: 'nowrap',
            minWidth: 'auto',
            width: 'auto',
            flex: '0 0 auto'
          }}
        >
          ← Back
        </button>
      </div>

      {/* Introduction Section */}
      <div className="dashboard-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(123, 92, 255, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)', border: '1px solid rgba(123, 92, 255, 0.25)' }}>
        <div className="card-header" style={{ borderBottom: '1px solid rgba(123, 92, 255, 0.2)' }}>
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📚</span>
            <span>Introduction</span>
          </h3>
        </div>
        <div className="card-content">
          <div style={{ lineHeight: 1.9, color: '#eae6ff', fontSize: 15, marginBottom: 24 }}>
            {lesson.description ? (
              <div dangerouslySetInnerHTML={{ __html: lesson.description.replace(/\n/g, '<br />') }} />
            ) : (
              <>
                Welcome to <strong style={{ color: '#a5b4fc' }}>{lesson.title}</strong>! This lesson is designed to help you master the fundamentals 
                of {activeLang === 'python' ? 'Python' : activeLang === 'javascript' ? 'JavaScript' : activeLang} 
                programming through hands-on practice. Whether you're a complete beginner or looking to strengthen 
                your foundation, this interactive course will guide you step by step.
              </>
            )}
          </div>
            <div style={{
            padding: '20px', 
              background: 'rgba(123, 92, 255, 0.12)',
              border: '1px solid rgba(123, 92, 255, 0.3)',
              borderRadius: 12,
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            boxShadow: '0 4px 12px rgba(123, 92, 255, 0.1)'
            }}>
            <div style={{ flex: '1 1 200px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Difficulty</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#eae6ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <span>{lesson.difficulty || 'Beginner'}</span>
              </div>
            </div>
            <div style={{ flex: '1 1 200px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Levels</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#eae6ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 20 }}>📝</span>
                <span>{totalLevels} Levels</span>
              </div>
            </div>
            <div style={{ flex: '1 1 200px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Language</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#eae6ff', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 8 }}>
                {activeLang === 'python' && (
                  <img 
                    src="/python-logo.png" 
                    alt="Python" 
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                )}
                {(activeLang === 'csharp' || activeLang === 'c#' || activeLang === 'cs') && (
                  <img 
                    src="/csharp_logo-221dcba91bfe189e98c562b90269b16f.png" 
                    alt="C#" 
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                )}
                {activeLang === 'javascript' && (
                  <img 
                    src="/javascript-logo-javascript-icon-transparent-free-png.webp" 
                    alt="JavaScript" 
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                )}
                {activeLang === 'cpp' && (
                  <img 
                    src="/c-logo-a2fa.png" 
                    alt="C++" 
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                )}
                {activeLang === 'php' && (
                  <img 
                    src="/php_PNG43.png" 
                    alt="PHP" 
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                )}
                {activeLang === 'mysql' && (
                  <img 
                    src="/269-2693201_mysql-logo-circle-png.png" 
                    alt="MySQL" 
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                )}
                <span>{activeLang === 'csharp' || activeLang === 'c#' || activeLang === 'cs' ? 'C#' : activeLang}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Basic Examples Section */}
      <div className="dashboard-card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 className="card-title">💡 Basic Examples</h3>
        </div>
        <div className="card-content">
          <p style={{ color: '#eae6ff', marginBottom: 16, fontSize: 15, lineHeight: 1.7 }}>
            Here are some basic examples to help you understand what you'll be working with. These examples demonstrate key concepts that you'll encounter throughout the lesson. Don't worry if it looks new. You'll learn by doing!
          </p>
          <div style={{
            background: 'rgba(17, 24, 39, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            padding: 20,
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 14,
            lineHeight: 1.7,
            color: '#eae6ff',
            position: 'relative'
          }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{exampleCode}</pre>
          </div>
          <p style={{ color: '#a0a0a0', marginTop: 12, fontSize: 13, fontStyle: 'italic' }}>
            💡 Tip: Try to understand what each line does. You'll be writing similar code in the puzzles!
          </p>
        </div>
      </div>

      {/* About the Levels Section */}
      <div className="dashboard-card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 className="card-title">🎯 About the Levels</h3>
        </div>
        <div className="card-content">
          <p style={{ color: '#eae6ff', marginBottom: 20, fontSize: 15, lineHeight: 1.8 }}>
            {getLevelDescription()}
          </p>
          <div style={{
            background: 'rgba(123, 92, 255, 0.05)',
            border: '1px solid rgba(123, 92, 255, 0.2)',
            borderRadius: 8,
            padding: 16
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              marginBottom: 12,
              color: '#eae6ff',
              fontWeight: 600
            }}>
              <span style={{ fontSize: 20 }}>📊</span>
              <span>Level Progression</span>
            </div>
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginTop: 12
            }}>
              {getLevelTitles().slice(0, 20).map((level) => (
                <div key={level.key} style={{
                  padding: '16px',
                  background: level.hasCode 
                    ? 'rgba(123, 92, 255, 0.1)' 
                    : 'rgba(123, 92, 255, 0.05)',
                  border: level.hasCode
                    ? '1px solid rgba(123, 92, 255, 0.3)'
                    : '1px solid rgba(123, 92, 255, 0.15)',
                  borderRadius: 8,
                  position: 'relative'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12,
                    marginBottom: 12,
                    flexWrap: 'wrap'
                  }}>
                    <div style={{
                      minWidth: 100,
                      padding: '8px 12px',
                      background: level.hasCode 
                        ? 'rgba(123, 92, 255, 0.2)' 
                        : 'rgba(123, 92, 255, 0.1)',
                      borderRadius: 6,
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      color: level.hasCode ? '#eae6ff' : '#a0a0a0',
                      position: 'relative'
                    }}>
                      {level.title}
                    </div>
                  </div>
                  <div style={{
                    color: '#cbd5e1',
                    fontSize: 14,
                    lineHeight: 1.7,
                    paddingLeft: 4
                  }}>
                    {level.discussion}
                  </div>
                </div>
              ))}
              {getLevelTitles().length > 20 && (
                <div style={{
                  padding: '12px 8px',
                  background: 'rgba(123, 92, 255, 0.15)',
                  border: '1px solid rgba(123, 92, 255, 0.3)',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#eae6ff'
                }}>
                  +{getLevelTitles().length - 20} more
                </div>
              )}
              {getLevelTitles().length === 0 && (
                <div style={{
                  padding: '12px 8px',
                  background: 'rgba(123, 92, 255, 0.1)',
                  border: '1px solid rgba(123, 92, 255, 0.2)',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#a0a0a0',
                  gridColumn: '1 / -1'
                }}>
                  Levels will be added by the admin
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 12,
              marginBottom: 12
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🎓</span>
              <div>
                <div style={{ color: '#eae6ff', fontWeight: 600, marginBottom: 4 }}>What to Expect</div>
                <div style={{ color: '#a0a0a0', fontSize: 14, lineHeight: 1.6 }}>
                  Each level includes clear instructions, example code, and immediate feedback. 
                  You can take your time and try different approaches until you get it right.
                </div>
              </div>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 12,
              marginTop: 12
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚡</span>
              <div>
                <div style={{ color: '#eae6ff', fontWeight: 600, marginBottom: 4 }}>Learning Path</div>
                <div style={{ color: '#a0a0a0', fontSize: 14, lineHeight: 1.6 }}>
                  Start with simple concepts and gradually tackle more challenging problems. 
                  Each completed level unlocks new knowledge and builds your confidence.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Motivational Section */}
      <div className="dashboard-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(123, 92, 255, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)', border: '1px solid rgba(123, 92, 255, 0.4)' }}>
        <div className="card-header">
          <h3 className="card-title">🚀 You've Got This!</h3>
        </div>
        <div className="card-content">
          <div style={{ 
            color: '#eae6ff', 
            fontSize: 16, 
            lineHeight: 1.8,
            marginBottom: 16
          }}>
            <p style={{ marginBottom: 12 }}>
              Every expert was once a beginner. The journey of learning to code starts with a single step, 
              and you're about to take that step! 🎉
            </p>
            <p style={{ marginBottom: 12 }}>
              Remember: <strong>Mistakes are part of learning</strong>. If you get stuck, that's perfectly normal. 
              Take a deep breath, read the instructions carefully, and try again. Each attempt makes you better.
            </p>
            <p>
              By the end of this lesson, you'll have a solid understanding of {lesson.title.toLowerCase()} and 
              the confidence to tackle more advanced topics. Let's begin your coding adventure! 💪
            </p>
          </div>
          <div style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 20
          }}>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              flex: '1 1 200px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>🎯</div>
              <div style={{ fontSize: 12, color: '#a0a0a0' }}>Hands-on Practice</div>
            </div>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              flex: '1 1 200px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>⚡</div>
              <div style={{ fontSize: 12, color: '#a0a0a0' }}>Real-time Feedback</div>
            </div>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              flex: '1 1 200px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>🏆</div>
              <div style={{ fontSize: 12, color: '#a0a0a0' }}>Build Skills</div>
            </div>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 32 }}>
        <button className="btn-secondary" onClick={handleGoBack} style={{ padding: '12px 24px' }}>
          ← Back to Courses
        </button>
        <button 
          className="btn-primary" 
          onClick={handleStartLesson}
          style={{ 
            padding: '14px 40px',
            fontSize: 17,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(123, 92, 255, 0.4)'
          }}
        >
          Start Learning Now! 🚀
        </button>
      </div>
    </div>
  )
}

