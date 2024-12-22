const log4js = require('log4js');
const config = require('./log4js-config');

// 配置log4js
log4js.configure(config);

// 获取logger实例的工厂函数
function getLogger(category = 'default') {
    return log4js.getLogger(category);
}

module.exports = {
    getLogger,
    shutdown: () => log4js.shutdown()
};
