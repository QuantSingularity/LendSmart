const { installMock, clearAll } = require("./mongooseMock");
installMock();
beforeEach(() => {
  clearAll();
});
