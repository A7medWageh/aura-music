const axios = require('axios');

async function run() {
  try {
    const res = await axios.get('http://localhost:3000/api/ytdownload?title=ramy sbri bad alfrak ma gnat&videoId=test');
    console.log(res.data);
  } catch (err) {
    if (err.response) {
       console.error("Status", err.response.status);
       console.error("Data", err.response.data);
    } else {
       console.error("Error", err.message);
    }
  }
}
run();
