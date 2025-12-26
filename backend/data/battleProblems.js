/**
 * Battle Problems Database
 * Problems organized by language and difficulty
 */

const problems = {
  python: [
    {
      id: 'two_sum_python',
      title: 'Two Sum',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0,1]',
          explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].'
        },
        {
          input: 'nums = [3,2,4], target = 6',
          output: '[1,2]'
        }
      ],
      constraints: [
        '2 <= nums.length <= 10^4',
        '-10^9 <= nums[i] <= 10^9',
        '-10^9 <= target <= 10^9',
        'Only one valid answer exists.'
      ],
      testCases: [
        { input: [[2,7,11,15], 9], output: [0,1] },
        { input: [[3,2,4], 6], output: [1,2] },
        { input: [[3,3], 6], output: [0,1] }
      ]
    },
    {
      id: 'reverse_string_python',
      title: 'Reverse String',
      description: 'Write a function that reverses a string. The input string is given as an array of characters s.\n\nYou must do this by modifying the input array in-place with O(1) extra memory.',
      difficulty: 'Easy',
      examples: [
        {
          input: 's = ["h","e","l","l","o"]',
          output: '["o","l","l","e","h"]'
        },
        {
          input: 's = ["H","a","n","n","a","h"]',
          output: '["h","a","n","n","a","H"]'
        }
      ],
      constraints: [
        '1 <= s.length <= 10^5',
        's[i] is a printable ascii character.'
      ],
      testCases: [
        { input: [['h','e','l','l','o']], output: ['o','l','l','e','h'] },
        { input: [['H','a','n','n','a','h']], output: ['h','a','n','n','a','H'] }
      ]
    },
    {
      id: 'valid_palindrome_python',
      title: 'Valid Palindrome',
      description: 'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward.\n\nGiven a string s, return true if it is a palindrome, or false otherwise.',
      difficulty: 'Easy',
      examples: [
        {
          input: 's = "A man, a plan, a canal: Panama"',
          output: 'true',
          explanation: '"amanaplanacanalpanama" is a palindrome.'
        },
        {
          input: 's = "race a car"',
          output: 'false',
          explanation: '"raceacar" is not a palindrome.'
        }
      ],
      constraints: [
        '1 <= s.length <= 2 * 10^5',
        's consists only of printable ASCII characters.'
      ],
      testCases: [
        { input: ['A man, a plan, a canal: Panama'], output: true },
        { input: ['race a car'], output: false }
      ]
    },
    {
      id: 'max_subarray_python',
      title: 'Maximum Subarray',
      description: 'Given an integer array nums, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum.\n\nA subarray is a contiguous part of an array.',
      difficulty: 'Medium',
      examples: [
        {
          input: 'nums = [-2,1,-3,4,-1,2,1,-5,4]',
          output: '6',
          explanation: '[4,-1,2,1] has the largest sum = 6.'
        },
        {
          input: 'nums = [1]',
          output: '1'
        }
      ],
      constraints: [
        '1 <= nums.length <= 10^5',
        '-10^4 <= nums[i] <= 10^4'
      ],
      testCases: [
        { input: [[-2,1,-3,4,-1,2,1,-5,4]], output: 6 },
        { input: [[1]], output: 1 }
      ]
    },
    {
      id: 'contains_duplicate_python',
      title: 'Contains Duplicate',
      description: 'Given an integer array nums, return true if any value appears at least twice in the array, and return false if every element is distinct.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums = [1,2,3,1]',
          output: 'true'
        },
        {
          input: 'nums = [1,2,3,4]',
          output: 'false'
        }
      ],
      constraints: [
        '1 <= nums.length <= 10^5',
        '-10^9 <= nums[i] <= 10^9'
      ],
      testCases: [
        { input: [[1,2,3,1]], output: true },
        { input: [[1,2,3,4]], output: false }
      ]
    }
  ],
  javascript: [
    {
      id: 'two_sum_js',
      title: 'Two Sum',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0,1]',
          explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].'
        }
      ],
      constraints: [
        '2 <= nums.length <= 10^4',
        '-10^9 <= nums[i] <= 10^9',
        '-10^9 <= target <= 10^9'
      ],
      testCases: [
        { input: [[2,7,11,15], 9], output: [0,1] },
        { input: [[3,2,4], 6], output: [1,2] }
      ]
    },
    {
      id: 'merge_arrays_js',
      title: 'Merge Sorted Arrays',
      description: 'You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n, representing the number of elements in nums1 and nums2 respectively.\n\nMerge nums2 into nums1 as one sorted array.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3',
          output: '[1,2,2,3,5,6]'
        }
      ],
      constraints: [
        'nums1.length == m + n',
        'nums2.length == n',
        '0 <= m, n <= 200',
        '1 <= m + n <= 200'
      ],
      testCases: [
        { input: [[1,2,3,0,0,0], 3, [2,5,6], 3], output: [1,2,2,3,5,6] }
      ]
    },
    {
      id: 'remove_duplicates_js',
      title: 'Remove Duplicates',
      description: 'Given an integer array nums sorted in non-decreasing order, remove the duplicates in-place such that each unique element appears only once. The relative order of the elements should be kept the same.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums = [1,1,2]',
          output: '2, nums = [1,2,_]'
        }
      ],
      constraints: [
        '1 <= nums.length <= 3 * 10^4',
        '-100 <= nums[i] <= 100'
      ],
      testCases: [
        { input: [[1,1,2]], output: 2 }
      ]
    }
  ],
  csharp: [
    {
      id: 'two_sum_csharp',
      title: 'Two Sum',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0,1]'
        }
      ],
      constraints: [
        '2 <= nums.length <= 10^4',
        '-10^9 <= nums[i] <= 10^9'
      ],
      testCases: [
        { input: [[2,7,11,15], 9], output: [0,1] }
      ]
    },
    {
      id: 'reverse_integer_csharp',
      title: 'Reverse Integer',
      description: 'Given a signed 32-bit integer x, return x with its digits reversed. If reversing x causes the value to go outside the signed 32-bit integer range [-2^31, 2^31 - 1], then return 0.',
      difficulty: 'Medium',
      examples: [
        {
          input: 'x = 123',
          output: '321'
        },
        {
          input: 'x = -123',
          output: '-321'
        }
      ],
      constraints: [
        '-2^31 <= x <= 2^31 - 1'
      ],
      testCases: [
        { input: [123], output: 321 },
        { input: [-123], output: -321 }
      ]
    }
  ],
  cpp: [
    {
      id: 'two_sum_cpp',
      title: 'Two Sum',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0,1]'
        }
      ],
      constraints: [
        '2 <= nums.length <= 10^4',
        '-10^9 <= nums[i] <= 10^9'
      ],
      testCases: [
        { input: [[2,7,11,15], 9], output: [0,1] }
      ]
    },
    {
      id: 'palindrome_number_cpp',
      title: 'Palindrome Number',
      description: 'Given an integer x, return true if x is a palindrome integer.\n\nAn integer is a palindrome when it reads the same backward as forward.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'x = 121',
          output: 'true'
        },
        {
          input: 'x = -121',
          output: 'false'
        }
      ],
      constraints: [
        '-2^31 <= x <= 2^31 - 1'
      ],
      testCases: [
        { input: [121], output: true },
        { input: [-121], output: false }
      ]
    }
  ],
  php: [
    {
      id: 'two_sum_php',
      title: 'Two Sum',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0,1]'
        }
      ],
      constraints: [
        '2 <= nums.length <= 10^4',
        '-10^9 <= nums[i] <= 10^9'
      ],
      testCases: [
        { input: [[2,7,11,15], 9], output: [0,1] }
      ]
    },
    {
      id: 'array_merge_php',
      title: 'Merge Arrays',
      description: 'Given two arrays, merge them into a single sorted array without duplicates.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'arr1 = [1,2,3], arr2 = [2,4,5]',
          output: '[1,2,3,4,5]'
        }
      ],
      constraints: [
        '1 <= arr1.length, arr2.length <= 100'
      ],
      testCases: [
        { input: [[1,2,3], [2,4,5]], output: [1,2,3,4,5] }
      ]
    }
  ],
  mysql: [
    {
      id: 'second_highest_mysql',
      title: 'Second Highest Salary',
      description: 'Write a SQL query to get the second highest salary from the Employee table.\n\nIf there is no second highest salary, then the query should return null.',
      difficulty: 'Medium',
      examples: [
        {
          input: 'Employee table:\n+----+--------+\n| id | salary |\n+----+--------+\n| 1  | 100    |\n| 2  | 200    |\n| 3  | 300    |\n+----+--------+',
          output: '+---------------------+\n| SecondHighestSalary |\n+---------------------+\n| 200                 |\n+---------------------+'
        }
      ],
      constraints: [],
      testCases: []
    },
    {
      id: 'nth_highest_mysql',
      title: 'Nth Highest Salary',
      description: 'Write a SQL query to get the nth highest salary from the Employee table.',
      difficulty: 'Medium',
      examples: [
        {
          input: 'n = 2',
          output: '200'
        }
      ],
      constraints: [],
      testCases: []
    },
    {
      id: 'duplicate_emails_mysql',
      title: 'Duplicate Emails',
      description: 'Write a SQL query to find all duplicate emails in a table named Person.',
      difficulty: 'Easy',
      examples: [
        {
          input: 'Person table:\n+----+---------+\n| id | email   |\n+----+---------+\n| 1  | a@b.com |\n| 2  | c@d.com |\n| 3  | a@b.com |\n+----+---------+',
          output: '+---------+\n| email   |\n+---------+\n| a@b.com |\n+---------+'
        }
      ],
      constraints: [],
      testCases: []
    }
  ]
};

/**
 * Get a random problem for a given language
 * @param {string} language - Language code (python, javascript, csharp, cpp, php, mysql)
 * @param {string} difficulty - Optional difficulty filter (Easy, Medium, Hard)
 * @returns {Object|null} Random problem or null if none found
 */
function getRandomProblem(language, difficulty = null) {
  const languageProblems = problems[language.toLowerCase()];
  
  if (!languageProblems || languageProblems.length === 0) {
    // Fallback to Python if language not found
    const fallbackProblems = problems.python;
    if (!fallbackProblems || fallbackProblems.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * fallbackProblems.length);
    return fallbackProblems[randomIndex];
  }

  // Filter by difficulty if specified
  let filteredProblems = languageProblems;
  if (difficulty) {
    filteredProblems = languageProblems.filter(p => p.difficulty === difficulty);
  }

  // If no problems match difficulty, use all problems
  if (filteredProblems.length === 0) {
    filteredProblems = languageProblems;
  }

  // Return random problem
  const randomIndex = Math.floor(Math.random() * filteredProblems.length);
  return filteredProblems[randomIndex];
}

/**
 * Get all problems for a language
 * @param {string} language - Language code
 * @returns {Array} Array of problems
 */
function getProblemsByLanguage(language) {
  return problems[language.toLowerCase()] || [];
}

module.exports = {
  problems,
  getRandomProblem,
  getProblemsByLanguage
};

