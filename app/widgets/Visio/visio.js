function logError(error) {
    console.log(error.name + ': ' + error.message);
    console.log(error);
}

var Visio = {
    pc: null,
    localVideo: null,
    remoteVideo: null,
    constraints: null,
    audioContext: null,
    max_level_L: 0,
    old_level_L: 0,
    from: null,
    type: null,

    videoSelect: undefined,
    switchCamera: undefined,
    localCreated: false,

    setFrom: function(from) {
        Visio.from = from;
    },

    gotStream: function() {
        Visio.constraints = window.constraints = {
            audio: true,
            video: {
                deviceId: Visio.videoSelect.value,
                facingMode: 'user',
                width: { ideal: 4096 },
                height: { ideal: 4096 }
            }
        };

        Visio.switchCamera.classList.add('disabled');
        Visio.localVideo.srcObject = null;

        // Useful on Android where you can't have both camera enabled at the same time
        var videoTrack = Visio.pc.getSenders().find(rtc => rtc.track.kind == 'video');
        if (videoTrack) videoTrack.track.stop();

        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(Visio.constraints)
            .then(function(stream) {
                Visio.switchCamera.classList.remove('disabled');

                Visio.localVideo.srcObject = stream;
                Visio.handleAudio(stream);

                // For the first time we attach all the tracks
                if (Visio.pc.getSenders().length == 0) {
                    stream.getTracks().forEach(track => Visio.pc.addTrack(track, stream));
                }

                // Switch camera
                let videoTrack = stream.getVideoTracks()[0];

                var sender = Visio.pc.getSenders().find(function(s) {
                    return s.track.kind == videoTrack.kind;
                });

                if (sender) {
                    sender.replaceTrack(videoTrack);
                }

                Visio.toggleMainButton();

                // if we received an offer, we need to answer
                if (Visio.pc.remoteDescription
                && Visio.pc.remoteDescription.type == 'offer') {
                    Visio.pc.createAnswer(Visio.localDescCreated, logError);
                }
            });
        }
    },

    gotDevices: function(deviceInfos) {
        Visio.videoSelect.innerText = '';

        const ids = [];

        for (let i = 0; i !== deviceInfos.length; ++i) {
            const deviceInfo = deviceInfos[i];

            if (deviceInfo.kind === 'videoinput' && !ids.includes(deviceInfo.deviceId)) {
                const option = document.createElement('option');
                option.value = deviceInfo.deviceId;
                option.text = deviceInfo.label;
                Visio.videoSelect.add(option);
                ids.push(deviceInfo.deviceId);
            }
        }

        if (ids.length >= 2) {
            document.querySelector("#visio #switch_camera").classList.add('enabled');
        }

        Visio.videoSelect.addEventListener('change', e => Visio.gotStream() );
        Visio.gotStream();
    },

    handleAudio: function(stream) {
        var microphone = Visio.audioContext.createMediaStreamSource(stream);
        var javascriptNode = Visio.audioContext.createScriptProcessor(2048, 1, 1);

        var cnvs = document.querySelector('#visio .level');
        var cnvs_cntxt = cnvs.getContext('2d');

        microphone.connect(javascriptNode);
        javascriptNode.connect(Visio.audioContext.destination);
        javascriptNode.onaudioprocess = function(event) {
            var inpt_L = event.inputBuffer.getChannelData(0);
            var instant_L = 0.0;

            var sum_L = 0.0;

            for(var i = 0; i < inpt_L.length; ++i) {
                sum_L += inpt_L[i] * inpt_L[i];
            }

            instant_L = Math.sqrt(sum_L / inpt_L.length);
            Visio.max_level_L = Math.max(Visio.max_level_L, instant_L);
            instant_L = Math.max( instant_L, Visio.old_level_L -0.008 );
            Visio.old_level_L = instant_L;

            cnvs_cntxt.clearRect(0, 0, cnvs.width, cnvs.height);
            cnvs_cntxt.fillStyle = 'white';
            cnvs_cntxt.fillRect(0, 0,(cnvs.width)*(instant_L/Visio.max_level_L),(cnvs.height)); // x,y,w,h
        }
    },

    onSDP: function(sdp, type) {
        Visio.type = type;

        console.log('SDP');
        console.log(sdp);

        return Visio.pc.setRemoteDescription(
            new RTCSessionDescription({'sdp': sdp + "\n", 'type': type}),
            function () { Visio_ajaxGetCandidates(); },
            logError
        );
    },

    localDescCreated: function(desc) {
        Visio.localCreated = true;
        Visio.pc.setLocalDescription(desc, Visio.toggleMainButton, logError);
    },

    onCandidates: function(candidates) {
        console.log('Canditates');
        candidates.forEach(candidate => {
            Visio.onCandidate(candidate[0], candidate[1], candidate[2]);
        });
    },

    onCandidate: function(candidate, mid, mlineindex) {
        console.log('candidate');
        console.log(candidate);

        Visio_ajaxGetCandidates();

        if (mid == '') mlineindex = 1;

        if (Visio.pc.remoteDescription == null || candidate.candidate == '') return;

        candidate = new RTCIceCandidate({
            'candidate': candidate,
            'sdpMid': mid,
            'sdpMLineIndex' : mlineindex
        });

        Visio.pc.addIceCandidate(candidate);
    },

    onTerminate: function() {
        let localStream = Visio.localVideo.srcObject;

        if (localStream) {
            localStream.getTracks().forEach(function(track) {
                track.stop();
            });
        }

        let remoteStream = Visio.remoteVideo.srcObject;

        if (remoteStream) {
            remoteStream.getTracks().forEach(function(track) {
                track.stop();
            });
        }

        Visio.localVideo.srcObject = null;
        Visio.remoteVideo.srcObject = null;
        Visio.localVideo.classList.add('hide');

        if (Visio.pc) Visio.pc.close();

        document.querySelector('p.state').innerText = Visio.states.ended;
        button = document.querySelector('#main');

        button.className = 'button action color red';
        button.querySelector('i').className = 'material-icons';
        button.querySelector('i').innerText = 'close';

        button.onclick = function() {
            window.close();
        }
    },

    init: function(sdp, type) {
        Visio.toggleMainButton();

        Visio.setFrom(MovimUtils.urlParts().params.join('/'));

        const servers = ['stun:stun01.sipphone.com',
            'stun:stun.ekiga.net',
            'stun:stun.fwdnet.net',
            'stun:stun.ideasip.com',
            'stun:stun.iptel.org',
            'stun:stun.rixtelecom.se',
            'stun:stun.schlund.de',
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun3.l.google.com:19302',
            'stun:stun4.l.google.com:19302',
            'stun:stunserver.org',
            'stun:stun.softjoys.com',
            'stun:stun.voiparound.com',
            'stun:stun.voipbuster.com',
            'stun:stun.voipstunt.com',
            'stun:stun.voxgratia.org',
            'stun:stun.xten.com'
        ];

        const shuffled = servers.sort(() => 0.5 - Math.random());

        var configuration = {
            'iceServers': [
                {urls: shuffled.slice(0, 2)}
            ]
        };

        // Switch camera
        Visio.videoSelect = document.querySelector('#visio select#visio_source');
        navigator.mediaDevices.enumerateDevices().then(devices => Visio.gotDevices(devices));

        Visio.switchCamera = document.querySelector("#visio #switch_camera");
        Visio.switchCamera.onclick = () => {
            Visio.videoSelect.selectedIndex++;

            // No empty selection
            if (Visio.videoSelect.selectedIndex == -1) {
                Visio.videoSelect.selectedIndex++;
            }

            Visio.gotStream();
        };

        // WebRTC
        Visio.pc = new RTCPeerConnection(configuration);

        Visio.pc.onicecandidate = function (evt) {
            Visio.toggleMainButton();

            if (evt.candidate) {
                Visio_ajaxCandidate(evt.candidate, Visio.from);
            }
        };

        Visio.pc.oniceconnectionstatechange = function () {
            Visio.toggleMainButton();
        };

        Visio.pc.onicegatheringstatechange = function (e) {
            // When we didn't receive the WebRTC termination before Jingle
            if (Visio.pc.iceConnectionState == 'disconnected') {
                Visio.onTerminate();
            }

            Visio.toggleMainButton();
        };

        Visio.audioContext = new AudioContext();

        Visio.toggleMainButton();

        if (sdp && type) {
            Visio.onSDP(sdp, type);
        }
    },

    /*
     * Actions
     */
    hello: function() {
        Visio.pc.createOffer(function (desc) {
            Visio.pc.setLocalDescription(desc, function () {
                Visio_ajaxInitiate(Visio.pc.localDescription, Visio.from);
            }, logError);
        }, logError);
    },

    answer: function() {
        Visio.localCreated = false;
        Visio_ajaxAccept(Visio.pc.localDescription, Visio.from);
    },

    goodbye: function() {
        Visio.onTerminate();
        Visio_ajaxTerminate(Visio.from);
    },

    /*
     * UI Status
     */
    toggleMainButton: function() {
        button = document.getElementById('main');
        state = document.querySelector('p.state');

        i = button.querySelector('i');

        button.classList.remove('red', 'green', 'gray', 'orange', 'ring', 'blue');
        button.classList.add('disabled');

        if (Visio.pc) {
            if (Visio.localCreated) Visio.answer();

            let length = Visio.pc.getSenders().length;

            if (Visio.pc.iceConnectionState != 'closed'
            && length > 0) {
                button.classList.remove('disabled');
            }

            button.onclick = function() {};

            if (length == 0) {
                button.classList.add('gray');
                i.innerText = 'more_horiz';
            } else if (Visio.pc.iceConnectionState == 'new') {
                if (Visio.pc.iceGatheringState == 'gathering'
                || Visio.pc.iceGatheringState == 'complete') {
                    button.classList.add('orange');
                    i.className = 'material-icons ring';
                    i.innerText = 'call';
                    state.innerText = Visio.states.ringing;

                    button.onclick = function() { Visio.goodbye(); };
                } else {
                    button.classList.add('green');
                    i.innerText = 'call';

                    button.onclick = function() { Visio.hello(); };
                }
            } else if (Visio.pc.iceConnectionState == 'checking') {
                button.classList.add('blue');
                i.className = 'material-icons disabled';
                i.innerText = 'more_horiz';
                state.innerText = Visio.states.connecting;
            } else if (Visio.pc.iceConnectionState == 'closed') {
                button.classList.add('gray');
                button.classList.remove('disabled');
                i.innerText = 'call_end';

                button.onclick = function() { Visio.goodbye(); };
            } else if (Visio.pc.iceConnectionState == 'connected'
                   || Visio.pc.iceConnectionState == 'complete'
                   || Visio.pc.iceConnectionState == 'failed') {
                button.classList.add('red');
                i.className = 'material-icons';
                i.innerText = 'call_end';

                if (Visio.pc.iceConnectionState == 'failed') {
                    state.innerText = Visio.states.failed;
                } else {
                    // Visio.pc.ontrack seems buggy for now
                    Visio.remoteVideo.srcObject = Visio.pc.getRemoteStreams()[0];
                    Visio.remoteVideo.classList.add('enabled');
                    state.innerTest = Visio.states.in_call;
                }

                button.onclick = function() { Visio.goodbye(); };
            }
        }
    },

    toggleFullScreen: function() {
        var button = document.querySelector('#toggle_fullscreen i');

        if (!document.fullscreenElement) {
            if (document.body.requestFullscreen) {
                document.body.requestFullscreen();
            }

            button.innerText = 'fullscreen_exit';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }

            button.innerText = 'fullscreen';
        }
    },

    toggleAudio: function() {
        var button = document.querySelector('#toggle_audio i');
        var rtc = Visio.pc.getSenders().find(rtc => rtc.track.kind == 'audio');

        if (rtc && rtc.track.enabled == 1) {
            rtc.track.enabled = 0;
            button.innerText = 'mic_off';
        } else if (rtc) {
            rtc.track.enabled = 1;
            button.innerText = 'mic';
        }
    },

    toggleVideo: function() {
        var button = document.querySelector('#toggle_video i');
        var rtc = Visio.pc.getSenders().find(rtc => rtc.track.kind == 'video');

        if (rtc && rtc.track.enabled == 1) {
            rtc.track.enabled = 0;
            button.innerText = 'videocam_off';
        } else if (rtc) {
            rtc.track.enabled = 1;
            button.innerText = 'videocam';
        }
    },
}

MovimWebsocket.attach(function() {
    Visio.localVideo = document.getElementById('video');
    Visio.remoteVideo = document.getElementById('remote_video');
    Visio_ajaxAskInit();
});

window.onbeforeunload = function() {
    Visio.goodbye();
}
