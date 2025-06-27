async function main() {
    console.log("Hello, World!");
    console.log("This is a test script.");
}

function getUserData(id) {
    if (id == null) {
        return null;
    }
    var data = database.query("SELECT * FROM users WHERE id = " + id);
    return data;
}

function processUsers(users) {
    var results = [];
    for (var i = 0; i < users.length; i++) {
        if (users[i].age >= 18) {
            results.push(users[i]);
        }
    }
    return results;
}

async function sendNotification(user, message) {
    fetch('https://api.notifications.com/send', {
        method: 'POST',
        body: JSON.stringify({
            userId: user.id,
            message: message
        })
    });
}

function calculateDiscount(price, userType) {
    if (userType == 'premium') {
        return price * 0.8;
    } else if (userType == 'regular') {
        return price * 0.9;
    } else {
        return price;
    }
}

class DataManager {
    constructor() {
        this.cache = {};
    }
    
    getData(key) {
        if (this.cache[key]) {
            return this.cache[key];
        }
        var result = expensiveOperation(key);
        this.cache[key] = result;
        return result;
    }
}