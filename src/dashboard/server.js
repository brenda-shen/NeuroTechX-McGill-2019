// const { app, BrowserWindow } = require('electron');
const dgram = require('dgram');
// const events = require('events');
const express = require('express');
const app_express = express();
const server = app_express.listen(3000);
const io = require('socket.io').listen(server);
const fs = require('fs');

var osc = require('node-osc');
var oscServer = new osc.Server(12345, '127.0.0.1');

const createCSVWriter = require('csv-writer').createObjectCsvWriter;
var csvTimeWriter, csvFFTWriters;

const sendRate = 0.25; //In fraction per second
const samplesPerSecond = 250;
var samplesToSend = samplesPerSecond * sendRate;
var toSend = [];
var mode = "training";

//Will determine if collecting and sending to file currently.
//Other values will only be updated if collecting is true!
var collecting = false;
var duration = 0;
var direction = "none";
var active = [];
var collectionTimer=null;

/*EXPRESS*/
// Sets static directory as public
app_express.use(express.static(__dirname + '/public'));

app_express.get('/', (req, res) => {
  res.send('index');
});

console.log('Listening on Port 3000!')


/*TIME*/


/* Gets the current time */
function getTimeValue() {
  var dateBuffer = new Date();
  var Time = dateBuffer.getTime();
  //Milliseconds since 1 January 1970
  return Time;
}


/*SETTING UP CSV WRITERS*/

/*Time csv writer*/
/* Formatting header of time CSV */
const timeHeader = [{id: 'time', title: 'TIME'},
                    {id: 'direction', title: 'DIRECTION'},
                    {id: 'channel1', title: 'CHANNEL 1'},
                    {id: 'channel2', title: 'CHANNEL 2'},
                    {id: 'channel3', title: 'CHANNEL 3'},
                    {id: 'channel4', title: 'CHANNEL 4'},
                    {id: 'channel5', title: 'CHANNEL 5'},
                    {id: 'channel6', title: 'CHANNEL 6'},
                    {id: 'channel7', title: 'CHANNEL 7'},
                    {id: 'channel8', title: 'CHANNEL 8'}]

/* Setting up array for actually storing the time data where each index has
the header data (time, channels 1-8) */
const timeHeaderToWrite = {
                  time: 'Time',
                  direction: 'Direction',
                  channel1: 'Channel 1',
                  channel2: 'Channel 2',
                  channel3: 'Channel 3',
                  channel4: 'Channel 4',
                  channel5: 'Channel 5',
                  channel6: 'Channel 6',
                  channel7: 'Channel 7',
                  channel8: 'Channel 8'
                };

var timeSamples = [timeHeaderToWrite];
//Global variable will be used to store time data


/* Sets the csvwriters to the correct paths! */
function setupCsvWriters(){
    let date = new Date();
    var day = date.getFullYear() + '-' + (date.getMonth()+1) + '-' +
                   date.getDate() + '-' + date.getHours() + '-' +
                   date.getMinutes() + '-' + date.getSeconds();
   //Formatting date as YYYY-MM-DD-hr-min-sec

    csvTimeWriter = createCSVWriter({
          path: __dirname + '/data/time-test-' + trialName + '-'
                          + day + '.csv',
          //File name of CSV for time test
          header: timeHeader,
          append: true
    });

}


var trialName=null;

oscServer.on("message", function (data) {

    let time = getTimeValue();//Milliseconds since January 1 1970. Adjust?
    let dataWithoutFirst = [];

    let toWrite = {'time': time, 'data': data.slice(1), 'direction': direction};

    if(mode == "production"){
      toSend.push(toWrite);
      if(toSend.length > samplesToSend){
        io.sockets.emit('timeseries-prediction', {'data': toSend});
        toSend = [];
      }

    }
    else{
      if (data[0] == 'fft') {
        if (collecting) {
          appendSample(toWrite, type="fft"); // Write to file
        }
        io.sockets.emit('fft', {'time': time, 'eeg': data.slice(1)});
        // Regardless of if we're collecting, we're always sending data to client
        // This data is used to make the graphs
      }
      else {
        if (collecting) {
          appendSample(toWrite, type="time");
        }
        io.sockets.emit('timeseries', {'time': time, 'eeg': data.slice(1)});
        //This data is used to make the graphs
      }
    }

      // console.log(data);
});

/* When we're collecting data (collecing = True), this function is run for every
sample. It writes samples to a CSV file, recording the collected data and the time.

Takes in 'data' object which has 'time' and 'data' attributes, and type (fft or time) */
function appendSample(data, type){
  channelData = [];
  for (i = 0; i < 8; i++) {
    if (active[i] == 1) {//Only get data for active channels
        channelData[i] = data['data'][i];
    }
    else {
      channelData[i] = null;
    }
  }
  //When fft data is passed
  if (type =='fft') {
    let fftSamplesToPush = [];
    //For each channel gets values for 1-125Hz
    for (i=0; i<8; i++) {
      fftSamplesToPush.push({time: data['time']});
      for (j=0; j<125; j++) {
         fftSamplesToPush[i]['f' + (j+1)] = channelData[i][j];
         //channelData is 2D for fft
      }
    }
    for (i=0; i<8; i++) {
      fftSamples[i].push(fftSamplesToPush[i]);
      //Pushing 8 125 value arrays to global fftSamples variable
    }
  }

  else if (type == 'time') {
    let timeSampleToPush = {time: data['time'],
                    direction: data['direction'],
                    channel1: channelData[0],
                    channel2: channelData[1],
                    channel3: channelData[2],
                    channel4: channelData[3],
                    channel5: channelData[4],
                    channel6: channelData[5],
                    channel7: channelData[6],
                    channel8: channelData[7]
                  }
    //channelData is 1D for time
    timeSamples.push(timeSampleToPush);
    //Updating global timeSamples variable
  }
}


/*END OF TRIAL*/


/* This function runs when a trial is finishing.If data is meant to be saved,
test number increments by one and testNumber is reset. timeSamples and
fftSamples are reset as well, to just the headers.Takes boolean argument. */
function endTest(saved){
  if(saved){
    // time data is written to CSV
    csvTimeWriter.writeRecords(timeSamples).then(() => {
      console.log('Added some time samples');
    });
  }
  else{
      console.log("User terminated trial. No data saved.")
  }

  //Both global variables are reset
  timeSamples = [];
}


/*USER CONTROL OF COLLECTING BOOLEAN WITH SOCKET IO*/


//Socket IO:
io.on('connection', function(socket){
  console.log('A user connected');

  if(mode == "production"){
    socket.on("data from ML", function(data){
      io.sockets.emit('to robotics', {'response': data['response']});
    });
  }

  socket.on('stop', function(){
      clearInterval(collectionTimer);
      collecting = false;
      endTest(false);
  });

  socket.on('collectQueue', function(clientRequest){
    mode = "training";
    timeSamples = [timeHeaderToWrite];
    collectQueue = clientRequest['queue'];
    trialName = clientRequest['trialName']
    console.log(collectQueue);
    console.log("This is trial: " + trialName);


    active = clientRequest['sensors'];

    let totalTime = 0;
    let times = [];
    collectQueue.forEach(function(command){
      totalTime+=command[1];
      times.push(totalTime);
    });

    console.log(totalTime);


    direction = collectQueue[0][0];
    setupCsvWriters();
    collecting = true;

    let j = 0;
    let time = 0;
    collectionTimer = setInterval(function(){
        if (time < totalTime) {
          if (time >= times[j]){
            // move onto next commmand
            endTest(true, true); //end old test
            j += 1;
            direction = collectQueue[j][0]; //setup new one!
          }
        }
        else {
          collecting = false;
          endTest(true, true);
          clearInterval(collectionTimer);
          console.log("Trial over.");
        }
        time++;
    }, 1000);



  });
  //Production
  socket.on('production', function(data){
    toSend = [];
    mode = "production";
    console.log(mode);
  });
});
