let express = require("express");
let path = require("path");
let { open } = require("sqlite");
let sqlite3 = require("sqlite3");
let jwt = require("jsonwebtoken");
let bcrypt = require("bcrypt");

let app = express();
app.use(express.json());

module.exports = app;

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

let initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Running Server Successfully..!!!");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

let authenticateUser = (request, response, next) => {
  let jwtToken;
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secretKey", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

let covertToStateObj = (data) => {
  let resultArray = [];
  let convertedObj = {};
  for (let item of data) {
    convertedObj = {
      stateId: item.state_id,
      stateName: item.state_name,
      population: item.population,
    };
    resultArray.push(convertedObj);
  }
  return resultArray;
};

let covertToDistrictObj = (data) => {
  let resultArray = [];
  let convertedObj = {};
  for (let item of data) {
    convertedObj = {
      districtId: item.district_id,
      districtName: item.district_name,
      stateId: item.state_id,
      cases: item.cases,
      cured: item.cured,
      active: item.active,
      deaths: item.deaths,
    };
    resultArray.push(convertedObj);
  }
  return resultArray;
};

//API-1
app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  let checkUserQuery = `
    SELECT *
    FROM user
    WHERE username = "${username}";
  `;

  let dbUser = await db.get(checkUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secretKey");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-2
app.get("/states", authenticateUser, async (request, response) => {
  let getStatesQuery = `
        SELECT *
        FROM state
    `;
  let states = await db.all(getStatesQuery);
  response.send(covertToStateObj(states));
});

//API-3
app.get("/states/:stateId/", authenticateUser, async (request, response) => {
  let { stateId } = request.params;
  let getStateQuery = `
        SELECT *
        FROM state
        WHERE state_id = ${stateId}
    `;
  let state = await db.all(getStateQuery);
  response.send(covertToStateObj(state)[0]);
});

//API-4
app.post("/districts/", authenticateUser, async (request, response) => {
  let districtDetails = request.body;
  let { districtName, stateId, cases, cured, active, deaths } = districtDetails;
  let postDistrictQuery = `
        INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
        VALUES ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});
    `;
  await db.run(postDistrictQuery);
  response.send("District Successfully Added");
});

//API-5
app.get(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    let { districtId } = request.params;
    let getDistrictQuery = `
        SELECT *
        FROM district
        WHERE district_id = ${districtId};
    `;
    let district = await db.all(getDistrictQuery);
    response.send(covertToDistrictObj(district)[0]);
  }
);

//API-6
app.delete(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    let { districtId } = request.params;
    let postDistrictQuery = `
        DELETE FROM district
        WHERE district_id = ${districtId};
    `;
    await db.run(postDistrictQuery);
    response.send("District Removed");
  }
);

//API-7
app.put(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    let { districtId } = request.params;
    let districtDetails = request.body;
    let {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    let updateDistrictQuery = `
        UPDATE district
        SET district_name='${districtName}', state_id=${stateId}, cases=${cases}, cured=${cured}, active=${active}, deaths=${deaths}
        WHERE district_id=${districtId};
    `;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//API-8
app.get(
  "/states/:stateId/stats/",
  authenticateUser,
  async (request, response) => {
    let { stateId } = request.params;
    let getStateStatsQuery = `
        SELECT SUM(district.cases), SUM(district.cured) , SUM(district.active) , SUM(district.deaths)
        FROM state
        INNER JOIN district ON state.state_id = district.state_id
        WHERE state.state_id = ${stateId}
        GROUP BY state.state_id
    `;
    let stats = await db.get(getStateStatsQuery);
    response.send({
      totalCases: stats["SUM(district.cases)"],
      totalCured: stats["SUM(district.cured)"],
      totalActive: stats["SUM(district.active)"],
      totalDeaths: stats["SUM(district.deaths)"],
    });
  }
);
