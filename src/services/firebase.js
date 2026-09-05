const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
try {
  let serviceAccount;
  
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    // Hosted environment (e.g. Render)
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };
  } else {
    // Local development
    serviceAccount = require(path.join(__dirname, '../../../firebase-adminsdk.json'));
  }

  admin.initializeApp({
    credential: admin.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization failed:', error.message);
}

/**
 * Send a push notification via FCM
 * @param {string} token FCM device token
 * @param {string} title Notification title
 * @param {string} body Notification body
 * @param {object} data Additional data payload
 */
const sendPushNotification = async (token, title, body, data = {}) => {
  if (!token) return false;
  
  try {
    const message = {
      notification: { title, body },
      data: { ...data },
      token,
    };
    await admin.messaging().send(message);
    return true;
  } catch (err) {
    console.error('FCM Error:', err.message);
    return false;
  }
};

module.exports = {
  admin,
  sendPushNotification,
};
