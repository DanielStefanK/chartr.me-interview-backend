require('dotenv').config({ path: '.env' });

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const cors = require('cors');
const { performance, PerformanceObserver } = require('perf_hooks');
//var tm = require('text-miner');

const db = require('./db');

// TODO: only our frontend
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/api/:id', async function(req, res) {
  const interview = await db.query.interview(
    { where: { id: req.params.id } },
    '{name company {name} activeUntil deleted results {id} limit}',
  );

  if (interview && !interview.deleted) {
    if (new Date(interview.activeUntil) < new Date()) {
      return res.json({
        error: 'Interview is expired',
        interview,
      });
    }

    if (interview.results.length >= interview.limit) {
      return res.json({
        error: 'Interview has reached participants limit',
        interview,
      });
    }

    return res.json({ error: false, interview });
  } else {
    return res.json({
      error: 'Interview was not found',
      interview: null,
    });
  }
});

function countWords(str) {
  return str.trim().split(/\s+/).length;
} //function to count words in a given string

io.on('connection', function(socket) {
  //todo: create data struction manageing all clients at once and serving them the right questions
  let interview;
  socket._content = new Object();
  console.log('a user connected');
  socket._timestamp0;
  socket._timestamp1;
  socket._id;
  socket.on('interview_id', async function(id) {
    socket._id = id;
    console.log('id: ' + socket._id);
    interview = await db.query.interview(
      { where: { id: socket._id } },
      '{name company {name} activeUntil deleted results {id} limit interview { question subQuestions {question}}}',
    );

    socket.emit('question', interview.interview[0]);

    socket._timestamp0 = performance.now();
    // for checking how long a user took

    socket._content['question' + 0] = interview.interview[0].question;
  });

  socket.on('disconnect', function() {
    console.log('user disconnected');
  });
  socket._email;
  socket._name;
  socket.on('credentials', function(msg) {
    console.log('credentials: name:' + msg.name + ' email:' + msg.email);
    socket._email = msg.email;
    socket._name = msg.name;
  });
  socket._questionNumber = 1;
  socket._subQuestionLevel = 0;
  socket._whichSubQuestion = 0;

  socket.on('message', async function(msg) {
    socket._timestamp1 = performance.now();
    var durationInMs = socket._timestamp1 - socket._timestamp0;
    // mesure time to answer in sec
    interview = await db.query.interview(
      { where: { id: socket._id } },
      '{ name company {id name} activeUntil deleted results {id} limit interview{distraction question  time subQuestions { subQuestions {question time distraction answerTags{tag value} matchTags} question time distraction answerTags{tag value} matchTags} answerTags{value tag}}}',
    );
    if (socket._questionNumber !== interview.interview.length) {
      console.log('message: ' + msg);
      console.log(interview.interview[socket._questionNumber].question);
      var wordCountQuestion = countWords(
        interview.interview[socket._questionNumber].question,
      );
      var wordCountMsg = countWords(msg);
      var lengthVariable = 1.0;
      var lengthVariableMAX = 6.17938;
      var lengthVariableMIN = 0.53423;
      // could also be defined by the user
      // these numbers for lengthVariableMAX and MIN are not set and should be changed acording to the data we would reseive for a prototype as given in the task we got i will be using the numbers from the paper
      if (wordCountMsg / wordCountQuestion > lengthVariableMAX) {
        console.log('got here');
        lengthVariable =
          0.0 + Math.exp(lengthVariableMAX - wordCountMsg / wordCountQuestion);
      } else if (wordCountMsg / wordCountQuestion < lengthVariableMIN) {
        lengthVariable = 1 - Math.exp(-(wordCountMsg / wordCountQuestion));
      }
      // what happens here is when wordCountMsg / wordCountQuestion is higher then our given MAX we decres the value of given tag matched by an exp funktion vice versa we do it MIN

      var tags = interview.interview[socket._questionNumber].answerTags;
      var subQuestionsFromDB =
        interview.interview[socket._questionNumber - 1].subQuestions;

      for (var i = 1; i <= socket._subQuestionLevel; i++) {
        subQuestionsFromDB =
          subQuestionsFromDB[socket._whichSubQuestion].subQuestions;
        console.log('i:' + i);
      } //goes deaper for subsubquestions for each subQuestionLevel

      console.log('socket._subQuestionLevel' + socket._subQuestionLevel);
      console.log('tags');

      console.log(tags);

      var subQuestionVariable;
      console.log('sQFDB');
      console.log(subQuestionsFromDB);
      var askSubQuestion = false;
      var numberOfSubQuestion = 0;
      if (typeof subQuestionsFromDB !== 'undefined') {
        subQuestionsFromDB.forEach(function(subQuestion) {
          subQuestion.matchTags.forEach(function(tag) {
            if (msg.indexOf(tag) !== -1) {
              subQuestionVariable = subQuestion;
              tags = subQuestion.answerTags;
              askSubQuestion = true;
              socket._whichSubQuestion = numberOfSubQuestion;
            }
            numberOfSubQuestion++;
          });
        });
      }
      //defines if a subquestion needs to be asked and gets subQuestionVariable (array with all parameters of a given question)
      var result = 0.0;

      tags.forEach(function(tag) {
        if (msg.indexOf(tag.tag) !== -1) {
          result += (tag.value / 100) * lengthVariable;
          console.log('result' + result);
        }
      });

      //adds up the result for a question

      console.log('askSubQuestion:' + askSubQuestion);
      if (askSubQuestion) {
        socket.emit('question', subQuestionVariable);
        socket._timestamp0 = performance.now();
        // reset timer for duration mesurment
        if (socket._subQuestionLevel > 1) {
          socket._content['subAnswer' + socket._subQuestionLevel] = msg;
          socket._content[
            'subDuration' + socket._subQuestionLevel
          ] = durationInMs;
        } else {
          socket._content['answer' + (socket._questionNumber - 1)] = msg;
          socket._content[
            'duration' + (socket._questionNumber - 1)
          ] = durationInMs;
        }
        socket._subQuestionLevel += 1;

        socket._content['subQuestion' + socket._subQuestionLevel] =
          subQuestionVariable.question;
        // to get a level deaper in subquestions
      } else {
        console.log(interview.interview.length);
        console.log(socket._questionNumber);

        if (socket._subQuestionLevel == 0) {
          socket._content['answer' + (socket._questionNumber - 1)] = msg;
          socket._content[
            'duration' + (socket._questionNumber - 1)
          ] = durationInMs;
        } else {
          socket._content['subAnswer' + socket._subQuestionLevel] = msg;
          socket._content[
            'subDuration' + socket._subQuestionLevel
          ] = durationInMs;
        }
        socket._content['question' + socket._questionNumber] =
          interview.interview[socket._questionNumber].question;
        socket.emit('question', interview.interview[socket._questionNumber]);

        socket._timestamp0 = performance.now();
        // reset timer for duration mesurment
        socket._questionNumber += 1;

        // to get to the next question
        socket._subQuestionLevel = 0;
        // to reset the level so lower question wont be asked
      }
    } else {
      if (socket._subQuestionLevel == 0) {
        socket._content['answer' + (socket._questionNumber - 1)] = msg;
        socket._content[
          'duration' + (socket._questionNumber - 1)
        ] = durationInMs;
      } else {
        socket._content['subAnswer' + socket._subQuestionLevel] = msg;
        socket._content[
          'subDuration' + socket._subQuestionLevel
        ] = durationInMs;
      }
      socket.emit('end');

      db.mutation
        .createResult({
          data: {
            deleted: false,
            name: socket._name,
            email: socket._email,
            score: result,
            content: socket._content,
            interview: {
              connect: {
                id: socket._id,
              },
            },
            company: {
              connect: {
                id: interview.company.id,
              },
            },
          },
        })
        .then(data => {
          console.log(data);
        })
        .catch(data => {
          console.log(data);
        });
    }
  });
});

app.use((req, res) => {
  res.status(404);
});

http.listen(3000, function() {
  console.log('listening on *:3000');
});
//
