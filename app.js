const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19India.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is running");
    });
  } catch (error) {
    console.log(`DB error ${error.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const stateDBObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const districtDBObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.get("/states/", async (request, response) => {
  const getStateQuery = `SELECT * FROM state;`;
  const stateArray = await db.all(getStateQuery);
  response.send(
    stateArray.map((eachState) => stateDBObjectToResponseObject(eachState))
  );
});

app.get("/states/:stateId/", async (request, response) => {
  const { stateId } = request.params;
  const getState = `SELECT * FROM state WHERE state_id=${stateId};`;
  const stateResponse = await db.get(getState);
  response.send(stateDBObjectToResponseObject(stateResponse));
});

app.post("/districts/", async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
     VALUES ('${districtName}',${stateId},${cases},${cured},${active},${deaths});`;
  const createResponse = await db.run(createDistrictQuery);
  response.send("District Successfully Added");
});

app.get("/districts/:districtId/", async (request, response) => {
  const { districtId } = request.params;
  const getQuery = `SELECT * FROM district WHERE district_id=${districtId};`;
  const queryResponse = await db.get(getQuery);
  response.send(districtDBObjectToResponseObject(queryResponse));
});

app.delete("/districts/:districtId/", async (request, response) => {
  const { districtId } = request.params;
  const deleteQuery = `DELETE FROM district WHERE district_id=${districtId};`;
  await db.run(deleteQuery);
  response.send("District Removed");
});

app.put("/districts/:districtId/", async (request, response) => {
  const { districtId } = request.params;
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const updateDistrictQuery = `UPDATE district SET district_name='${districtName}',state_id=${stateId},
    cases=${cases},cured=${cured},active=${active},deaths=${deaths} WHERE district_id=${districtId};`;
  await db.run(updateDistrictQuery);
  response.send("District Details Updated");
});

app.get("/states/:stateId/stats/", async (request, response) => {
  const { stateId } = request.params;
  const sumQuery = `SELECT SUM(cases),SUM(cured),SUM(active),SUM(deaths) 
    FROM district WHERE state_id=${stateId};`;
  const sumResponse = await db.get(sumQuery);
  response.send({
    totalCases: sumResponse["SUM(cases)"],
    totalCured: sumResponse["SUM(cured)"],
    totalActive: sumResponse["SUM(active)"],
    totalDeaths: sumResponse["SUM(deaths)"],
  });
});

app.get("/districts/:districtId/details/", async (request, response) => {
  const { districtId } = request.params;
  const getState = `SELECT state_name FROM district NATURAL JOIN state WHERE district_id=${districtId};`;
  const dbResponse = await db.get(getState);
  response.send({ stateName: dbResponse.state_name });
});
module.exports = app;
