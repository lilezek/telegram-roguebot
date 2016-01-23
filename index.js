const cp = require('child_process');
const spawn = cp.spawn;
const exec = cp.exec;
var rogue;
const async = require('async');
const fs = require('fs');
const rogueScreenWatcher = fs.watch("rogue.screen");
const TelegramBot = require('node-telegram-bot-api');
const token = require('./telegram').token;
const tbot = new TelegramBot(token, {
  polling: true
});
const temp = require('temp');
const help = fs.readFileSync("help.txt").toString();

"use strict";

temp.track();

function newRogue(savegame) {
  console.log("new rogue "+savegame);
  function setUpRogue() {
    rogue.stdout.on('data', function(data) {
      console.log('stdout: ' + data.length);
    });

    rogue.stderr.on('data', function(data) {
      console.log('stderr: ' + data.length);
    });

    rogue.on('close', function(code) {
      console.log('child process exited with code ' + code);
      if (!kill)
        newRogue(true);
    });
    rogue.stdin.write("o\ntt\nRogue bot\n\n\n ");
  }

  if (savegame) {
    // Copiar el fichero
    exec("cp -p rogue.save rogue.save.copy", function() {
      rogue = spawn('rogue', ['rogue.save']);
      exec("cp -p rogue.save.copy rogue.save");
      setUpRogue();
    });
  } else {
    rogue = spawn('rogue', []);
    setUpRogue();
  }
}

newRogue(process.argv.indexOf('load') != -1);

var kill = false;

function killRogue() {
  if (kill)
    return;
  console.log('killing children');
  kill = true;
  rogue.kill();
  process.exit(0);
}

if (process.argv.indexOf('debug') == -1)  {
  process.on('exit', killRogue);
  process.on('SIGINT', killRogue); // catch ctrl-c
  process.on('SIGTERM', killRogue); // catch kill
}

var chatIds = [];
var whiteList = {
  '13665326': true,
  '-85761406': true,
};
var blackListUsers = {};
var blackListCommands = {
  'Q': true,
  'o': true,
  'S': true
};
var specialCommands = {};
var sendImage = false;
rogueScreenWatcher.on('change', function(event, filename) {
  var rogueText = fs.readFileSync("rogue.screen").toString();
  var tempName = temp.path({
    suffix: ".png"
  });
  exec("convert -size 550x330 xc:white -font /usr/share/fonts/truetype/freefont/FreeMono.ttf -fill black -pointsize 12 -draw \"text 0,30 '" + rogueText.replace(/\'/g, '\\\'') + "'\" " + tempName, {}, function() {
    for (var i = 0; i < chatIds.length; i++) {
      if (sendImage)
        tbot.sendPhoto(chatIds[i], tempName);
      else {
        var x = rogueText.indexOf("--press space to continue--");
        if (x != -1) {
          var pos = charToPosition(rogueText, x - 2);
          tbot.sendMessage(chatIds[i], "```\n" + mapToText(textToMap(rogueText), pos.x, 0, 80, pos.y) + "\n```", {
            parse_mode: 'Markdown'
          });
          rogue.stdin.write(" ");
        } else if (!/[ \n]/.test(rogueText[0])) {
          tbot.sendMessage(chatIds[i], "```\n" + readMessage(rogueText) + "\n" + calculateBlock(rogueText) + "\n```", {
            parse_mode: 'Markdown'
          });
        } else {
          tbot.sendMessage(chatIds[i], "```\n" + calculateStatus(rogueText) + "\n" + calculateBlock(rogueText) + "\n```", {
            parse_mode: 'Markdown'
          });
        }
      }
      chatIds = [];
    }
    sendImage = false;
  });
});

function charToPosition(text, index) {
  var x = 0;
  var y = 0;
  for (var i = 0; i < index; i++) {
    if (text[i] == "\n") {
      x = 0;
      y++;
    } else {
      x++;
    }
  }
  return {
    x: x,
    y: y
  };
}

function textToMap(text) {
  var result = [
    []
  ];
  var fila = result[0];
  for (var i = 0; i < text.length; i++) {
    if (text[i] == "\n") {
      fila = [];
      result.push(fila);
    } else
      fila.push(text[i]);
  }
  // Normalizar los huecos a 80x25
  for (var y = 0; y < result.length; y++) {
    while (result[y].length < 80) {
      result[y].push(' ');
    }
  }
  // Eliminar la primera fila que es para mensajes
  result.shift();
  // Eliminar las dos últimas filas que contiene el estado y vacío.
  result.pop();
  result.pop();
  return result;
}

function mapToText(map, x, y, x2, y2) {
  x = Math.max(0, x);
  y = Math.max(0, y);
  y2 = Math.min(y2, map.length);
  x2 = Math.min(x2, map[0].length);
  var result = "";
  for (var sy = y; sy < y2; sy++) {
    for (var sx = x; sx < x2; sx++) {
      result += map[sy][sx];
    }
    result += "\n";
  }
  return result;
}

function calculateBlock(text) {
  var map = textToMap(text);
  var y = 0;
  var x = 0;
  var found = false;
  for (y = 0; y < map.length && !found; y++) {
    for (x = 0; x < map[y].length && !found; x++) {
      if (map[y][x] == '@') {
        found = true;
      }
    }
  }
  console.log(found, x, y);
  if (found)
    return mapToText(map, x - 10, y - 10, x + 10, y + 10);
}

function calculateStatus(text) {
  var lines = text.split("\n");
  return lines[lines.length - 2].replace(/[ ]+/g, " ");
}

function readMessage(text) {
  var lines = text.split("\n");
  return lines[0].replace("-more-", "\nUse /gmore to read more");
}

// Any kind of message
tbot.on('message', function(msg) {
  console.log(msg);
  var chatId = msg.chat.id;
  var command = msg.text;
  if (command[0] == '/') {
    command = command.substr(1);
    if (command.indexOf("@lilroguebot") > -1) {
      command = command.split("@lilroguebot")[0].trim();
    }
  } else if (command.indexOf("@lilroguebot") > -1) {
    command = command.split("@lilroguebot")[1].trim();
  }
  if (chatId in whiteList) {
    console.log(command);
    chatIds.push(chatId);
    if (command.toLowerCase() in specialCommands) {
      specialCommands[command.toLowerCase()](msg);
    } else {
      if (command in keyboardMappings)
        rogue.stdin.write(keyboardMappings[command]);
      else
        for (var i = 0; i < command.length; i++) {
          if (!(command[i] in blackListCommands)) {
            rogue.stdin.write(command[i]);
          }
        }
      updateScreen();
    }
  } else {
    console.log(chatId + " not in whiteList");
  }
});

function updateScreen() {
  rogue.stdin.write("&");
}

function showInventory() {
  rogue.stdin.write("i");
}

specialCommands['gmore'] = function() {
  rogue.stdin.write(" &");
}

specialCommands['ghelp'] = function(msg) {
  tbot.sendMessage(msg.chat.id, help);
}

specialCommands['gsave'] = function(msg) {
  rogue.stdin.write("S\n");
}

specialCommands['gload'] = function(msg) {

  try {
    fs.statSync("rogue.save");
    tbot.sendMessage(msg.chat.id, "Loading saved game");
    rogue.kill();
  } catch (e) {
    tbot.sendMessage(msg.chat.id, "There is no saved game");
  }
}

specialCommands['gmap'] = function(msg) {
  sendImage = true;
  rogue.stdin.write("&");
}

var keyboardMappings = {
  '➡️': 'l',
  '⬅️': 'h',
  '⬆️': 'k',
  '⬇️': 'j',
  '↗️': 'u',
  '↘️': 'n',
  '↙️': 'b',
  '↖️': 'y',
  '🎒': 'i'
}

specialCommands['gkeyboard'] = function(msg) {
  // ➡️⬅️⬆️⬇️↗️↘️↙️↖️
  tbot.sendMessage(msg.chat.id, "enabling keyboard", {
    reply_to_message_id: msg.message_id,
    reply_markup: JSON.stringify({
      keyboard: [
        ['↖️', '⬆️', '↗️'],
        ['⬅️', '🎒', '➡️'],
        ['↙️', '⬇️', '↘️']
      ]
    })
  })
}

specialCommands['gunkeyboard'] = function(msg) {
  tbot.sendMessage(msg.chat.id, "disabling keyboard", {
    'reply_to_message_id': msg.message_id,
    'reply_markup': JSON.stringify({
      hide_keyboard: true
    })
  })
}
