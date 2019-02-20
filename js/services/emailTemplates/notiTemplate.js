
const { httpType, gqImageUrl } = require('../../shared')
const thanksSec = require('./common/thanksSec')
const footerSec = require('./common/footerSec')

module.exports = (email, content) => {
  return `
    <html>
      <body>
        <div style="margin: 2em;">
          <img height="64" width="64" src="${gqImageUrl}" />
          <p style="font-size: 1.4em; font-weight: bold;">Hi, ${email},</p>
          <div style="margin-top: 1em; margin-bottom: 1em;">
            <p>${content}</p>
          </div>
          ${thanksSec}
          ${footerSec}
        </div>
      </body>
    </html>
  `;
};
