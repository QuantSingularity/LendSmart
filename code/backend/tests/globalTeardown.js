module.exports = async () => {
  if (global.__FAKE_MONGO_SERVER__) {
    await global.__FAKE_MONGO_SERVER__.stop();
    console.log("✅ Fake MongoDB server stopped");
  }
};
