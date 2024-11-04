import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
const PORT = 3000;
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
app.get("/", (req, res) => {
  res.send("Hello World");
});
server.listen(PORT, () => {
  console.log(`server running at port ${PORT}`);
});
var RoomEvents;
(function (RoomEvents) {
  RoomEvents["CREATE_ROOM"] = "CREATE_ROOM";
  RoomEvents["JOIN_ROOM"] = "JOIN_ROOM";
  RoomEvents["LEAVE_ROOM"] = "LEAVE_ROOM";
  RoomEvents["ROOM_INFO"] = "ROOM_INFO";
})(RoomEvents || (RoomEvents = {}));
var BanquetEvents;
(function (BanquetEvents) {
  BanquetEvents["CREATE_BANQUET"] = "CREATE_BANQUET";
  BanquetEvents["UPDATE_BANQUET"] = "UPDATE_BANQUET";
  BanquetEvents["REMOVE_BANQUET"] = "REMOVE_BANQUET";
  BanquetEvents["REMOVE_ALL_BANQUETS"] = "REMOVE_ALL_BANQUETS";
  BanquetEvents["INPUT_FOCUS_CHANGE"] = "INPUT_FOCUS_CHANGE";
  BanquetEvents["REQUEST_BANQUETS_DATA"] = "REQUEST_BANQUETS_DATA";
  BanquetEvents["SEND_BANQUETS_DATA"] = "SEND_BANQUETS_DATA";
})(BanquetEvents || (BanquetEvents = {}));
const usersMap = new Map();
const roomsMap = new Map();
const userToRoomMap = new Map();
io.on("connection", (socket) => {
  const eventListeners = Object.values(BanquetEvents).map((event) => {
    const listener = (...args) => {
      const roomId = userToRoomMap.get(socket.id);
      if (!roomId) return;
      socket.broadcast.to(roomId).emit(event, ...args);
    };
    return { event, listener };
  });
  const connectSocket = (roomId) => {
    if (!roomId) return;
    eventListeners.forEach(({ event, listener }) => {
      if (event && listener) {
        socket.on(event, listener);
      }
    });
    userToRoomMap.set(socket.id, roomId);
  };
  const disconnectSocket = () => {
    eventListeners.forEach(({ event, listener }) => {
      if (event && listener) {
        socket.off(event, listener);
      }
    });
    userToRoomMap.delete(socket.id);
  };
  socket.on("disconnect", () => {
    usersMap.delete(socket.id);
    disconnectSocket();
    // remove user from all rooms
    // and remove room if it has no participants
    for (const room of roomsMap.keys()) {
      if (!roomsMap.get(room)?.has(socket.id)) continue;
      roomsMap.get(room)?.delete(socket.id);
      emitRoomParticipants(room, roomsMap.get(room));
      if (roomsMap.get(room)?.size === 0) {
        roomsMap.delete(room);
      }
    }
  });
  socket.on(RoomEvents.CREATE_ROOM, ({ roomId, userName }, callback) => {
    try {
      socket.join(roomId);
      connectSocket(roomId);
      usersMap.set(socket.id, { userName, roomCreator: true });
      roomsMap.set(roomId, new Set([socket.id]));
      callback?.({ success: true });
    } catch {
      callback?.({ success: false, error: "Не удалось создать комнату" });
    }
  });
  socket.on(RoomEvents.JOIN_ROOM, ({ roomId, userName }, callback) => {
    try {
      if (!roomsMap.has(roomId)) {
        callback?.({
          success: false,
          error: "Комната не найдена",
        });
        return;
      }
      if (
        Array.from(roomsMap.get(roomId) || []).some(
          (socketId) => usersMap.get(socketId)?.userName === userName
        )
      ) {
        callback?.({
          success: false,
          error: "Имя занято",
        });
        return;
      }
      socket.join(roomId);
      connectSocket(roomId);
      const roomCreator = [...(roomsMap.get(roomId) ?? [])].find(
        (socketId) => usersMap.get(socketId)?.roomCreator
      );
      if (roomCreator) {
        socket.to(roomCreator).emit(BanquetEvents.REQUEST_BANQUETS_DATA);
      }
      usersMap.set(socket.id, { userName });
      roomsMap.set(
        roomId,
        new Set([...(roomsMap.get(roomId) ?? []), socket.id])
      );
      emitRoomParticipants(roomId, roomsMap.get(roomId));
      callback?.({ success: true });
    } catch {
      callback?.({
        success: false,
        error: "Не удалось присоединиться к комнате",
      });
    }
  });
  socket.on(RoomEvents.LEAVE_ROOM, (roomId, callback) => {
    try {
      socket.leave(roomId);
      disconnectSocket();
      const newRoomParticipants = new Set([
        ...[...(roomsMap.get(roomId) ?? [])].filter((id) => id !== socket.id),
      ]);
      emitRoomParticipants(roomId, newRoomParticipants);
      usersMap.delete(socket.id);
      if (newRoomParticipants.size === 0) {
        roomsMap.delete(roomId);
      } else {
        roomsMap.set(roomId, newRoomParticipants);
      }
      callback?.({ success: true });
    } catch {
      callback?.({ success: false, error: "Не удалось покинуть комнату" });
    }
  });
});
// helpers
function emitRoomParticipants(roomId, participants) {
  if (!roomId) return;
  setTimeout(() => {
    io.to(roomId).emit(RoomEvents.ROOM_INFO, {
      participants: Array.from(participants || [])
        .map((userId) => usersMap.get(userId)?.userName)
        .filter(Boolean),
    });
  });
}