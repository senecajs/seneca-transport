node readme-many-colors-server.js red FF0000 8081 --seneca.log=level:info --seneca.log=type:act,regex:color &
node readme-many-colors-server.js green 00FF00 8082 --seneca.log=level:info --seneca.log=type:act,regex:color &
node readme-many-colors-server.js blue 0000FF 8083 --seneca.log=level:info --seneca.log=type:act,regex:color &

node readme-many-colors-client.js --seneca.log=type:act,regex:CLIENT &
sleep 1
echo 
echo 


curl -d '{"color":"red"}' http://localhost:10101/act
echo
echo 
sleep 1

curl -d '{"color":"green"}' http://localhost:10101/act
echo
echo 
sleep 1

curl -d '{"color":"blue"}' http://localhost:10101/act
echo
echo 
sleep 1

curl -d '{"list":"colors","names":["red","green","blue"]}' http://localhost:10101/act
echo
echo 
sleep 1

killall node






