// Test for VS Code Context Bridge Change Proposal Feature

const SERVER_URL = "http://localhost:3210";

async function checkServer() {
  console.log("Checking if server is running...");
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const result = await response.json();
    return true;
  } catch (error) {
    console.log("Server not running");
    return false;
  }
}

async function testCodeImprovements() {
  console.log("Testing multiple code improvements");

  const proposal = {
    title: "Modernize and secure code",
    description: "Fix security issues, modernize syntax, and improve error handling",
    filePath: "/examples/test.js",
    changes: [
      {
        startLine: 6,  // getUserData function 
        endLine: 12,   
        originalContent: `function getUserData(id) {
    if (id == null) {
        return null;
    }
    var data = database.query("SELECT * FROM users WHERE id = " + id);
    return data;
}`,
        proposedContent: `function getUserData(id) {
    if (id == null) {
        return null;
    }
    // Fix SQL injection vulnerability
    const data = database.query("SELECT * FROM users WHERE id = ?", [id]);
    return data;
}`,
        description: "Fix SQL injection vulnerability by using parameterized queries"
      },
      {
        startLine: 13,  // processUsers function
        endLine: 22,    
        originalContent: `function processUsers(users) {
    var results = [];
    for (var i = 0; i < users.length; i++) {
        if (users[i].age >= 18) {
            results.push(users[i]);
        }
    }
    return results;
}`,
        proposedContent: `function processUsers(users) {
    if (!Array.isArray(users)) {
        throw new Error('Users must be an array');
    }
    // Use modern array methods
    return users.filter(user => user && user.age >= 18);
}`,
        description: "Modernize with array methods and add input validation"
      },
      {
        startLine: 24,  // sendNotification function
        endLine: 32,    
        originalContent: `async function sendNotification(user, message) {
    fetch('https://api.notifications.com/send', {
        method: 'POST',
        body: JSON.stringify({
            userId: user.id,
            message: message
        })
    });
}`,
        proposedContent: `async function sendNotification(user, message) {
    try {
        const response = await fetch('https://api.notifications.com/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                message: message
            })
        });
        
        if (!response.ok) {
            throw new Error(\`Notification failed: \${response.statusText}\`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Failed to send notification:', error);
        throw error;
    }
}`,
        description: "Add proper error handling and response processing"
      },
      {
        startLine: 34,  // calculateDiscount function
        endLine: 42,    
        originalContent: `function calculateDiscount(price, userType) {
    if (userType == 'premium') {
        return price * 0.8;
    } else if (userType == 'regular') {
        return price * 0.9;
    } else {
        return price;
    }
}`,
        proposedContent: `function calculateDiscount(price, userType) {
    if (typeof price !== 'number' || price < 0) {
        throw new Error('Price must be a positive number');
    }
    
    const discountRates = {
        premium: 0.8,
        regular: 0.9,
        default: 1.0
    };
    
    const rate = discountRates[userType] || discountRates.default;
    return price * rate;
}`,
        description: "Add input validation and use object lookup for cleaner code"
      }
    ]
  };

  try {
    const response = await fetch(`${SERVER_URL}/propose-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proposal),
    });

    const result = await response.json();
    console.log("Result:", result);
  } catch (error) {
    console.error("Failed:", error.message);
  }
}

async function runTest() {
  console.log("Starting code improvements test\n");

  const serverRunning = await checkServer();
  if (!serverRunning) {
    return;
  }

  await testCodeImprovements();
}

runTest().catch(console.error);
