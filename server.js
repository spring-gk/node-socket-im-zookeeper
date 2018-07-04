var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    fs = require('fs'),
    md5 = require('md5'),
    app_config = require('./config'),//配置文件
    common_func = require('./library/common'),//公用函数
    bodyParser = require('body-parser'),
    urlencodedParser = bodyParser.urlencoded({ extended: false }),// 创建 application/x-www-form-urlencoded 编码解析
    server_ip = common_func.getIPAdress(), //server端IP 
    file_common = app_config.log_dir + common_func.getDate(),
    xin_client_log = file_common + "/client.log",//记录所有访问记录
    xin_msg_log = file_common +"/msg.log",//记录消息日志
    xin_sys_log = file_common + "/sys.log",//记录系统日志
    xin_error_log = file_common + "/error.log"//记录系统错误日志
    ;

//异常情况处理
function uncaughtExceptionHandler(err){
    var error_info = err;
    if(typeof(error_info) == "object"){
        error_info = JSON.stringify(error_info);
    }
    
    if(err && (err.code == 'ECONNREFUSED' || err.code == 'ECONNRESET')){
        //redis 异常
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] uncaughtExceptionHandler:"+error_info, 'utf8', function(err){});
    }else{
        console.log("process exit:uncaughtExceptionHandler:",err);
        fs.appendFile(xin_error_log, '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] process exit: uncaughtExceptionHandler:"+error_info, 'utf8', function(err){});
        process.exit(1);
    }
}
process.on('uncaughtException', uncaughtExceptionHandler);

//检测日志文件夹是否创建
common_func.createFolder(app_config.log_dir + common_func.getDate());
//凌晨重新生成新的消息记录文件
setInterval(function(){
    var d = new Date();
    if(d.getHours() == 0){
        var file_common = app_config.log_dir + common_func.getDate();
        var msg_common = '\r\n<br>' + common_func.formatDate() +"["+ server_ip +"] ";
        try{
            //检测日志文件夹是否创建
            common_func.createFolder(file_common);
            //更新文件路径
            xin_msg_log = file_common +"/msg.log";
            xin_sys_log = file_common + "/sys.log";
            xin_client_log = file_common + "/client.log";
            xin_error_log = file_common + "/error.log";
            //记录日志信息
            fs.appendFile(xin_sys_log, msg_common +" xin_msg_log: "+ xin_msg_log, 'utf8', function(err){});
            fs.appendFile(xin_sys_log, msg_common +" xin_sys_log: "+ xin_sys_log, 'utf8', function(err){});
            fs.appendFile(xin_sys_log, msg_common +" xin_client_log: "+ xin_client_log, 'utf8', function(err){});
            fs.appendFile(xin_sys_log, msg_common +" xin_error_log: "+ xin_error_log, 'utf8', function(err){});

            //删除当天在线数据
            
        }catch(err){
            fs.appendFile(xin_sys_log, msg_common +" setInterval err: "+ err, 'utf8', function(err){});
        }
    }
},1000*60*30);

//local：本地环境 || development：开发环境 || production：正式环境

/**************  web接口 ******************/
app.get('/', function(req, res){
  res.send("^_^ Hello to xin node service  ^_^");
});
//接收消息接口
app.post('/api/notify', urlencodedParser, function(req, res){
    // 够造 JSON 格式
    var result = {
        "code": 0,
        "msg": "",
        "data": ""
    }; 
    //发布的消息
    var message = {
       "source":req.body.source,
       "data":req.body.data,
       "sign":req.body.sign,
       "room_id":req.body.room_id,
       "filename":req.body.filename,
       "from_sys":true,
       "ip":server_ip
    };
    try{
        //验证数据
        if(message.source == undefined || message.source == "")
            throw "source can not be null!";
        if(message.data == undefined || message.data == "")
            throw "data can not be null!";
        if(message.sign == undefined || message.sign == "")
            throw "sign can not be null!";
        if(message.room_id == undefined || message.room_id == "")
            throw "room_id can not be null!";
        var sign_key = app_config.source_list[message.source].sign_key;
        if(sign_key == undefined)
            throw "this source can not be configured!";
        //验证签名
        var check_sign = md5(message.source + message.room_id + message.data + sign_key);
        //console.log("check_sign",check_sign);
        if(check_sign != message.sign)
            throw "api notify sign verify failed!";            
        delete message['sign'];
        if(message.filename == undefined){
            message.filename = "";
        }
        result.code = 1;
        result.msg = "message notify successed!";        
        
    }catch(err){
        result.code = 0;
        result.msg = err;
    }
    res.end(JSON.stringify(result));
});
//强制刷新客户端页面
app.get('/refreshpage', function(req, res){
    room = req.query.room;
    if(room != undefined)
        io.to(room).emit("refreshPage");
    else
        io.sockets.emit("refreshPage");
    res.send("refreshPage:"+room);
});
//读取消息记录
app.get("/readmsg", function (req, res) {
    source = req.query.source;
    filename = req.query.filename;
    if(source == undefined || source == "")
        return res.send("请指定source查询！");
    if(filename != undefined && common_func.trim(filename) != ""){
        var save_msg_log = xin_msg_log.replace("msg.log",source +"_"+ common_func.trim(filename));
    }else{
        var save_msg_log = xin_msg_log.replace("msg",source+"_msg");
    }
    
    fs.readFile(save_msg_log, 'utf8', function(err){}, function (err, data) {
        res.send(data);
    });
});
//读取系统消息记录
app.get("/readsysmsg", function (req, res) {
    fs.readFile(xin_sys_log, 'utf8', function(err){}, function (err, data) {
        if(err){
            res.send(err);
        }else{
            res.send(data);
        }
    });
});
//读取socket连接数
app.get("/read_connections",function(req,res){
    
});

//查看消息处理分布
app.get("/readmsglocation",function(req,res){
                   
});

//查看会话分布
app.get("/sessionlocation",function(req,res){
                  
});

//查看今天会话统计
app.get("/today",function(req,res){
    source = req.query.source;
    if(source == undefined || source == "")
        return res.send("请指定source查询！");
    
});
//查看在线会话
app.get("/online",function(req,res){
    source = req.query.source;
    if(source == undefined)
        return res.send("请指定source查询！");
    
});

//读取访问轨迹
app.get("/clientlog",function(req,res){
    fs.readFile(xin_client_log, 'utf8', function(err){}, function (err, data) {
        if(err){
            res.send(err);
        }else{
            res.send(data);
        }
    });
});
//读取error log
app.get("/errorlog",function(req,res){
    fs.readFile(xin_error_log, 'utf8', function(err){}, function (err, data) {
        if(err){
            res.send(err);
        }else{
            res.send(data);
        }
    });
});
//监听端口，开启服务
server.listen(app_config.port || 4000);

/*************Socket.io Server ***********/
io.use(function(socket,next){
    var source = socket.handshake.query.source;
    var userid = socket.handshake.query.userid;
    var username = socket.handshake.query.username;
    var sign = socket.handshake.query.sign;
    var room_ids = socket.handshake.query.room_ids;
    var ext_info = socket.handshake.query.ext_info;
    var watch_quit = socket.handshake.query.watch_quit;//监听退出
    var referer = socket.handshake.headers.referer;
    try{
        //check referer
        /*if(referer.indexOf("xx.com")==-1)
            throw "illegal websocket request!";*/
        //验证数据
        if(source == undefined || source == "")
            throw "source can not be null!";
        if(sign == undefined || sign == "")
            throw "cilent connect sign can not be null!";
        if(room_ids == undefined || room_ids == "" || room_ids == "*")
            throw "room_ids can not be null!";
        var sign_key = app_config.source_list[source].sign_key;
        if(sign_key == undefined)
            throw "this source can not be configured!";

        var check_sign = md5(source + room_ids + sign_key);
        //console.log("check_sign",check_sign);
        if(check_sign != sign)
            throw "sign verify failed!";   
        //记录客户端信息
        socket.source = source;
        socket.userid = userid;
        socket.username = username;
        socket.sign = sign;
        socket.room_ids = room_ids;
        socket.referer = referer;
        socket.ext_info = (ext_info == undefined ? "" : ext_info);
        socket.watch_quit = (watch_quit == undefined ? "" : watch_quit);
        socket.getClientInfo = function(){
        	return {
		        'socket_id': socket.id,
		        'source': source,
		        'userid': userid,
		        'username': username,
		        'room_ids': room_ids,
		        'referer': referer,
		        'ext_info': socket.ext_info,
                'watch_quit': socket.watch_quit,
		        'server_ip': server_ip
		    };
        };
        //console.log(socket);        
        return next();
    }catch(err){
        socket.emit("sys_error", err);
        return false;
    }   
});
//设置连接数为0

//删除当前在线数据


//处理socket请求
io.sockets.on('connection', function (socket) {
    
    //用户加入房间、记录用户信息
    try{
        //加入多个房间
        room_ids = socket.room_ids;
        //console.log("join room_ids:"+room_ids);
        if(typeof(room_ids)=="string" && room_ids.length>1){
            room_list = room_ids.split(",");
            for (var i = 0; i < room_list.length; i++) {
                if(room_list[i] != undefined && room_list[i] !=""){
                   socket.join(socket.source + room_list[i]);  
               }                
            }
            //记录用户链接信息到redis
            
            //console.log("join room:"+socket.id); 
        }else{
            throw "error room_ids!";   
        }         
    }catch(err){
        socket.emit("sys_error", err);
        
    }   
    //user leaves
    socket.on('disconnect', function () {
        //删除用户链接信息
        //判断是否有监听用户退出,通知其他客户端 
        //减少连接数

    });
    //接收客户端消息，并发布到redis
    socket.on('postMsg', function (data, room_id) {
        //console.log("postMsg:",data,room_id);
        try{
            //验证数据
            if(data == undefined || data == "")
                throw "data can not be null!";
            if(room_id == undefined || room_id == "")
                throw "room_id can not be null!";         
            
            message = {
                'source': socket.source,
                'data': data,
                'room_id': room_id,
                'from_sys': true
            }
            //发布消息到redis频道
                 
        }catch(err){
            socket.emit("sys_error", err);
            
        }        
    });
});

//监听订阅消息
                                                                                                                                                                                           
//获取订阅消息
function getSubscribeData() {
     //订阅消息客户端
    
}
//重新启动服务，记录环境变量信息
var tmp_app_config = {
	'env': app_config.env,
	'port': app_config.port,
	'log_dir': app_config.log_dir
};
var log_info = {
    'sys_info': true,
    'key': "system_start",
    'log_file': xin_sys_log,
    'app_config' : tmp_app_config,
    'server_ip': server_ip
};

