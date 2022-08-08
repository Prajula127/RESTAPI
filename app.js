const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is running");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const authToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const validPassword = (password) => {
  return password.length > 6;
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUser = `INSERT INTO user (name,username,password,gender) VALUES ('${name}','${username}','${hashedPassword}','${gender}');`;
    if (validPassword(password)) {
      await db.run(createUser);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getFollowingUserQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${dbUser.user_id};`;
  const followingUserObjectList = await db.all(getFollowingUserQuery);
  const followingUserList = followingUserObjectList.map((object) => {
    return object.following_user_id;
  });
  const getTweetQuery = `SELECT user.username AS username,tweet.tweet AS tweet,tweet.date_time AS dateTime FROM tweet INNER JOIN user ON user.user_id=tweet.user_id WHERE tweet.user_id IN (${followingUserList}) ORDER BY tweet.date_time DESC LIMIT 4;`;
  const tweetArray = await db.all(getTweetQuery);
  response.send(tweetArray);
});

app.get("/user/following/", authToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getFollowingUserQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${dbUser.user_id};`;
  const followingUserObjectList = await db.all(getFollowingUserQuery);
  const followingUserList = followingUserObjectList.map((object) => {
    return object.following_user_id;
  });
  const getFollowingQuery = `SELECT user.name AS name FROM user WHERE user_id IN (${followingUserList});`;
  const followingArray = await db.all(getFollowingQuery);
  response.send(followingArray);
});

app.get("/user/followers/", authToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getFollowerUserQuery = `SELECT follower_user_id FROM follower WHERE following_user_id=${dbUser.user_id};`;
  const followerUserObjectList = await db.all(getFollowerUserQuery);
  const followerUserList = followerUserObjectList.map((object) => {
    return object.follower_user_id;
  });
  const getFollowerQuery = `SELECT user.name AS name FROM user WHERE user_id IN (${followerUserList});`;
  const followerArray = await db.all(getFollowerQuery);
  response.send(followerArray);
});

app.get("/tweets/:tweetId/", authToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetInfo = await db.get(getTweetQuery);
  const getFollowingUserQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${dbUser.user_id};`;
  const followingUserObjectList = await db.all(getFollowingUserQuery);
  const followingUserList = followingUserObjectList.map((object) => {
    return object.following_user_id;
  });

  if (!followingUserList.includes(tweetInfo.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweet, date_time, tweet_id } = tweetInfo;
    const getLikeQuery = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id=${tweetId} GROUP BY tweet_id;`;
    const likeObject = await db.get(getLikeQuery);
    const getReplyQuery = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id=${tweetId} GROUP BY tweet_id;`;
    const replyObject = await db.get(getReplyQuery);
    response.send({
      tweet,
      likes: likeObject.likes,
      replies: replyObject.replies,
      dateTime: date_time,
    });
  }
});

app.get("/tweets/:tweetId/likes/", authToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetInfo = await db.get(getTweetQuery);
  const getFollowingUserQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${dbUser.user_id};`;
  const followingUserObjectList = await db.all(getFollowingUserQuery);
  const followingUserList = followingUserObjectList.map((object) => {
    return object.following_user_id;
  });

  if (!followingUserList.includes(tweetInfo.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { date_time, tweet_id } = tweetInfo;
    const userLikesQuery = `SELECT user_id FROM like WHERE tweet_id=${tweet_id};`;
    const userLikeObject = await db.all(userLikesQuery);
    const userLikeList = userLikeObject.map((object) => {
      return object.user_id;
    });
    const likeUserQuery = `SELECT username FROM user WHERE user_id IN (${userLikeList});`;
    const likeUserObjectList = await db.all(likeUserQuery);
    const likeUserList = likeUserObjectList.map((object) => {
      return object.username;
    });
    response.send({
      likes: likeUserList,
    });
  }
});

app.get("/tweets/:tweetId/replies/", authToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetInfo = await db.get(getTweetQuery);
  const getFollowingUserQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${dbUser.user_id};`;
  const followingUserObjectList = await db.all(getFollowingUserQuery);
  const followingUserList = followingUserObjectList.map((object) => {
    return object.following_user_id;
  });

  if (!followingUserList.includes(tweetInfo.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweet, date_time, tweet_id } = tweetInfo;
    const userRepliesQuery = `SELECT user.name AS name,reply.reply AS reply FROM reply INNER JOIN user ON reply.user_id=user.user_id WHERE reply.tweet_id=${tweet_id};`;
    const userReplyObject = await db.all(userRepliesQuery);
    response.send({
      replies: userReplyObject,
    });
  }
});

app.get("/user/tweets/", authToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getTweetQuery = `SELECT * FROM tweet WHERE user_id=${dbUser.user_id} ORDER BY tweet_id;`;
  const tweetObjectList = await db.all(getTweetQuery);
  const tweetList = tweetObjectList.map((object) => {
    return object.tweet_id;
  });
  const getLikeQuery = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id IN (${tweetList}) GROUP BY tweet_id ORDER BY tweet_id;`;
  const likeObjectList = await db.all(getLikeQuery);
  const getReplyQuery = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id IN (${tweetList}) GROUP BY tweet_id ORDER BY tweet_id;`;
  const replyObjectList = await db.all(getReplyQuery);
  response.send(
    tweetObjectList.map((tweetObj, index) => {
      const likes = likeObjectList[index] ? likeObjectList[index].likes : 0;
      const replies = replyObjectList[index]
        ? replyObjectList[index].replies
        : 0;
      return {
        tweet: tweetObj.tweet,
        likes: likes,
        replies: replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

app.post("/user/tweets/", authToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const dateString = new Date().toISOString();
  const dateTime = dateString.slice(0, 10) + " " + dateString.slice(11, 19);
  const newTweetQuery = `INSERT INTO tweet (tweet,user_id,date_time) VALUES ('${tweet}',${dbUser.user_id},'${dateTime}');`;
  await db.run(newTweetQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetInfo = await db.get(getTweetQuery);
  if (dbUser.user_id !== tweetInfo.user_id) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
