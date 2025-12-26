/**
 * Fallback C# Beginner puzzles used when the lessons database
 * does not yet have content for C# battles.
 */
const csharpBeginnerLevels = [
  {
    id: 'csharp_beginner_level_1',
    levelNumber: 1,
    title: 'Level 1: Fruit Basket',
    description: 'Add the number of apples and oranges to find the total fruit count.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        int apples = 4;
        int oranges = 3;
        Console.WriteLine(apples + oranges);
    }
}
    `.trim(),
    expectedOutput: '7'
  },
  {
    id: 'csharp_beginner_level_2',
    levelNumber: 2,
    title: 'Level 2: Rectangle Area',
    description: 'Multiply length and width to compute the area of a rectangle.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        int length = 6;
        int width = 4;
        Console.WriteLine(length * width);
    }
}
    `.trim(),
    expectedOutput: '24'
  },
  {
    id: 'csharp_beginner_level_3',
    levelNumber: 3,
    title: 'Level 3: Friendly Greeting',
    description: 'Build a greeting that includes the student name.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        string firstName = "Ava";
        string lastName = "Rivera";
        Console.WriteLine($"Hello, {firstName} {lastName}!");
    }
}
    `.trim(),
    expectedOutput: 'Hello, Ava Rivera!'
  },
  {
    id: 'csharp_beginner_level_4',
    levelNumber: 4,
    title: 'Level 4: Weekend Savings',
    description: 'Compute the money saved after two deposits.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        double firstDeposit = 15.50;
        double secondDeposit = 12.25;
        Console.WriteLine(firstDeposit + secondDeposit);
    }
}
    `.trim(),
    expectedOutput: '27.75'
  },
  {
    id: 'csharp_beginner_level_5',
    levelNumber: 5,
    title: 'Level 5: Temperature Report',
    description: 'Print the formatted temperature line.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        int temperature = 28;
        Console.WriteLine($"Outside temperature: {temperature}°C");
    }
}
    `.trim(),
    expectedOutput: 'Outside temperature: 28°C'
  },
  {
    id: 'csharp_beginner_level_6',
    levelNumber: 6,
    title: 'Level 6: Study Timer',
    description: 'Combine hours and minutes to describe study time.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        int hours = 2;
        int minutes = 30;
        Console.WriteLine($"Study time: {hours}h {minutes}m");
    }
}
    `.trim(),
    expectedOutput: 'Study time: 2h 30m'
  },
  {
    id: 'csharp_beginner_level_7',
    levelNumber: 7,
    title: 'Level 7: Classroom Desks',
    description: 'Determine how many desks are needed for the students.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        int students = 18;
        int seatsPerDesk = 2;
        Console.WriteLine(students / seatsPerDesk);
    }
}
    `.trim(),
    expectedOutput: '9'
  },
  {
    id: 'csharp_beginner_level_8',
    levelNumber: 8,
    title: 'Level 8: Scoreboard',
    description: 'Show a scoreboard entry using string concatenation.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        string player = "Mika";
        int score = 420;
        Console.WriteLine(player + " scored " + score);
    }
}
    `.trim(),
    expectedOutput: 'Mika scored 420'
  },
  {
    id: 'csharp_beginner_level_9',
    levelNumber: 9,
    title: 'Level 9: Notebook Weight',
    description: 'Combine notebook count and weight per notebook.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        int notebooks = 5;
        double weightPerNotebook = 0.45;
        Console.WriteLine(notebooks * weightPerNotebook);
    }
}
    `.trim(),
    expectedOutput: '2.25'
  },
  {
    id: 'csharp_beginner_level_10',
    levelNumber: 10,
    title: 'Level 10: Library Reminder',
    description: 'Format a reminder that includes title and due day.',
    difficulty: 'Easy',
    initialCode: `
using System;

class Program
{
    static void Main()
    {
        string bookTitle = "Space Explorers";
        string dueDay = "Friday";
        Console.WriteLine($"Return \"{bookTitle}\" by {dueDay}.");
    }
}
    `.trim(),
    expectedOutput: 'Return "Space Explorers" by Friday.'
  }
];

module.exports = csharpBeginnerLevels;

