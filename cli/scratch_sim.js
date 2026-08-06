const EventEmitter = require("events");

class MockRuntime extends EventEmitter {
  simulate(chunks) {
    let pendingPrint = "";
    let inToolCall = false;
    let inThinking = false;
    let inRtk = false;

    for (const chunk of chunks) {
      pendingPrint += chunk;

      while (pendingPrint.length > 0) {
        if (!inToolCall && !inThinking && !inRtk) {
          let thinkStart = pendingPrint.indexOf('<think>');
          let partialThink = -1;
          for (let i = 1; i <= '<think>'.length; i++) {
            if (pendingPrint.endsWith('<think>'.substring(0, i))) {
              partialThink = pendingPrint.length - i;
              break;
            }
          }
          if (thinkStart !== -1) {
            this.emit("chunk", pendingPrint.substring(0, thinkStart));
            inThinking = true;
            pendingPrint = pendingPrint.substring(thinkStart + '<think>'.length);
            continue;
          } else if (partialThink !== -1) {
            this.emit("chunk", pendingPrint.substring(0, partialThink));
            pendingPrint = pendingPrint.substring(partialThink);
            break;
          }
        }

        if (!inToolCall) {
          let tagStart = pendingPrint.indexOf('<tool_call>');
          let partialStart = -1;
          for (let i = 1; i <= '<tool_call>'.length; i++) {
            if (pendingPrint.endsWith('<tool_call>'.substring(0, i))) {
              partialStart = pendingPrint.length - i;
              break;
            }
          }
          if (tagStart !== -1) {
            this.emit("chunk", pendingPrint.substring(0, tagStart));
            this.emit("tool_call_start");
            inToolCall = true;
            pendingPrint = pendingPrint.substring(tagStart + '<tool_call>'.length);
          } else if (partialStart !== -1) {
            this.emit("chunk", pendingPrint.substring(0, partialStart));
            pendingPrint = pendingPrint.substring(partialStart);
            break;
          } else {
            this.emit("chunk", pendingPrint);
            pendingPrint = "";
          }
        } else {
          let tagEnd = pendingPrint.indexOf('</tool_call>');
          let partialEnd = -1;
          for (let i = 1; i <= '</tool_call>'.length; i++) {
            if (pendingPrint.endsWith('</tool_call>'.substring(0, i))) {
              partialEnd = pendingPrint.length - i;
              break;
            }
          }
          if (tagEnd !== -1) {
            inToolCall = false;
            pendingPrint = pendingPrint.substring(tagEnd + '</tool_call>'.length);
          } else if (partialEnd !== -1) {
            pendingPrint = pendingPrint.substring(partialEnd);
            break;
          } else {
            pendingPrint = "";
          }
        }
      }
    }
    if (pendingPrint.length > 0 && !inToolCall) {
      this.emit("chunk", pendingPrint);
    }
  }
}

const runtime = new MockRuntime();
runtime.on("chunk", text => process.stdout.write(text));
runtime.on("tool_call_start", () => process.stdout.write("[TOOL_CALL_START]"));

runtime.simulate(["<", "t", "o", "o", "l", "_", "c", "a", "l", "l", ">"]);
console.log("");
runtime.simulate(["<tool_call", ">"]);
console.log("");
runtime.simulate(["abc", "<t", "ool_call>"]);
console.log("");
