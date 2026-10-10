import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Moon, Sun, Users, Copy, Mic, MicOff, Shield, Skull, Eye, WandSparkles, DoorOpen, Volume2, CircleHelp, Sparkles, ChevronRight, Swords, HeartPulse } from 'lucide-react';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;

const API_URL = 'http://localhost:3000';

async function fetchRoomData(code) {
  const response = await fetch(
    `${API_URL}/api/rooms/${encodeURIComponent(code)}`
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Không tải được phòng.');
  }

  return {
    id: data.room.id,
    code: data.room.code,
    status: data.room.status,
    hostId: null,
    phase: data.room.phase || 'lobby',
    players: data.players.map((p) => ({
      id: p.id,
      name: p.display_name,
      role: null,
      alive: p.is_alive ?? true,
      host: p.seat_number === 1
    }))
  };
}
const roles = [
  {name:'Ma Sói', team:'Sói', icon:'🐺', desc:'Mỗi đêm cùng phe Sói chọn một người để loại.'},
  {name:'Dân làng', team:'Dân làng', icon:'🧑‍🌾', desc:'Thảo luận ban ngày, tìm ra Ma Sói và bỏ phiếu.'},
  {name:'Tiên tri', team:'Dân làng', icon:'🔮', desc:'Mỗi đêm kiểm tra một người để biết người đó có phải Sói không.'},
  {name:'Bảo vệ', team:'Dân làng', icon:'🛡️', desc:'Mỗi đêm chọn một người để bảo vệ.'},
  {name:'Phù thủy', team:'Dân làng', icon:'🧙', desc:'Có một bình cứu và một bình độc trong cả ván.'},
  {name:'Thợ săn', team:'Dân làng', icon:'🏹', desc:'Khi bị loại, có thể kéo theo một người.'}
];
const presets = {
  10: ['Ma Sói','Ma Sói','Ma Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân làng','Dân làng','Dân làng'],
  11: ['Ma Sói','Ma Sói','Ma Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân làng','Dân làng','Dân làng','Dân làng'],
  12: ['Ma Sói','Ma Sói','Ma Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân làng','Dân làng','Dân làng','Dân làng','Dân làng'],
  13: ['Ma Sói','Ma Sói','Ma Sói','Ma Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân làng','Dân làng','Dân làng','Dân làng','Dân làng'],
  14: ['Ma Sói','Ma Sói','Ma Sói','Ma Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân làng','Dân làng','Dân làng','Dân làng','Dân làng','Dân làng'],
  15: ['Ma Sói','Ma Sói','Ma Sói','Ma Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân làng','Dân làng','Dân làng','Dân làng','Dân làng','Dân làng','Dân làng']
};
const shuffle = a => [...a].sort(()=>Math.random()-.5);
const code = () => Math.random().toString(36).slice(2,7).toUpperCase();
const id = () => Math.random().toString(36).slice(2,11);
const getRole = name => roles.find(r=>r.name===name) || roles[1];

 export default function App(){
  const [name,setName] = useState('');
  const [roomCode,setRoomCode] = useState('');
  const [room,setRoom] = useState(null);
  const [me,setMe] = useState(null);
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [voiceOn,setVoiceOn] = useState(false);
  const [muted,setMuted] = useState(true);
  const [phase,setPhase] = useState('lobby');
  const [round,setRound] = useState(1);
  const [selected,setSelected] = useState('');
  const [votes,setVotes] = useState({});
  const [myRole,setMyRole] = useState(null);
  const [log,setLog] = useState(['Đêm Trăng Đỏ đã sẵn sàng. Tạo phòng để bắt đầu.']);
  const channelRef = useRef(null);
  const localStream = useRef(null);
  const audioRef = useRef(null);
  const isOnline = !!supabase;
  const players = room?.players || [];
  const alive = players.filter(p=>p.alive);
  const isHost = room && me && room.hostId===me.id;
  const currentMe = players.find(p=>p.id===me?.id) || me;
  const myRoleName = currentMe?.role || myRole;
  const myRoleInfo = getRole(myRoleName || 'Dân làng');
  const aliveWolves = alive.filter(p=>p.role==='Ma Sói').length;
  const aliveOthers = alive.length-aliveWolves;

  const updateRoom = async next => {
    setRoom(next);
    if (channelRef.current && supabase) await channelRef.current.send({type:'broadcast',event:'room_state',payload:{room:next}});
  };
  const subscribeRoom = async roomId => {
    if (!supabase) return;
    if (channelRef.current) await supabase.removeChannel(channelRef.current);
    const ch = supabase.channel('werewolf-'+roomId,{config:{broadcast:{self:true},presence:{key:me?.id || 'guest'}}});
    ch.on('broadcast',{event:'room_state'},({payload})=>{ if(payload?.room) setRoom(payload.room); });
    ch.on('broadcast',{event:'room_action'},({payload})=>{ if(payload?.message) setLog(prev=>[payload.message,...prev].slice(0,8)); });
    ch.on('presence',{event:'sync'},()=>{});
    ch.subscribe(async status=>{ if(status==='SUBSCRIBED') await ch.track({name:me?.name || name,playerId:me?.id || ''}); });
    channelRef.current=ch;
  };
  useEffect(()=>()=>{ if(channelRef.current && supabase) supabase.removeChannel(channelRef.current); if(localStream.current) localStream.current.getTracks().forEach(t=>t.stop()); },[]);

 
useEffect(() => {
  if (!room?.code || room.phase !== 'lobby') return;

  let cancelled = false;

  const refreshRoom = async () => {
    try {
      const latest = await fetchRoomData(room.code);

      if (cancelled) return;

      setRoom((current) => {
        if (!current) return current;

        return {
          ...current,
          ...latest,
          round: current.round || 1,
          nightActions: current.nightActions || {},
          votes: current.votes || {}
        };
      });
    } catch (error) {
      console.error('Refresh room failed:', error);
    }
  };

  refreshRoom();

  const timer = setInterval(refreshRoom, 2000);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}, [room?.code, room?.phase]);
const createRoom = async () => {
  if (!name.trim()) {
    return setNotice('Nhập tên của em trước nhé.');
  }

  setBusy(true);
  setNotice('');

  try {
    const response = await fetch('http://localhost:3000/api/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        displayName: name.trim().slice(0, 18)
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Không tạo được phòng.');
    }

    const player = {
      id: data.player.id,
      name: data.player.display_name || name.trim().slice(0, 18),
      role: null,
      alive: true,
      host: true
    };

    const next = {
      id: data.room.id,
      code: data.room.code,
      hostId: player.id,
      players: [player],
      phase: data.room.phase || 'lobby',
      round: 1,
      nightActions: {},
      votes: {},
      createdAt: Date.now()
    };

    setMe({
      ...player,
      sessionToken: data.sessionToken
    });
    setRoom(next);
    setRoomCode(next.code);
    setPhase(next.phase);
    setNotice('Tạo phòng thành công! Mã phòng: ' + next.code);
  } catch (error) {
    console.error('Create room failed:', error);

    setNotice(
      error.message ||
      'Không kết nối được backend. Kiểm tra Terminal của server nhé.'
    );
  } finally {
    setBusy(false);
  }
};
  
const joinRoom = async () => {
  if (!name.trim() || !roomCode.trim()) {
    return setNotice('Nhập tên và mã phòng nhé.');
  }

  setBusy(true);
  setNotice('');

  try {
    const codeClean = roomCode.trim().toUpperCase();

    const response = await fetch(
      `http://localhost:3000/api/rooms/${encodeURIComponent(codeClean)}/join`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: name.trim().slice(0, 18)
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Không tham gia được phòng.');
    }

    const player = {
      id: data.player.id,
      name: data.player.display_name,
      role: null,
      alive: data.player.is_alive ?? true,
      host: false
    };

    const next = {
      id: data.room.id,
      code: data.room.code,
      hostId: null,
      players: [player],
      phase: data.room.phase || 'lobby',
      round: 1,
      nightActions: {},
      votes: {}
    };

    setMe({
      ...player,
      sessionToken: data.sessionToken
    });
    setRoom(next);
    setRoomCode(codeClean);
    setPhase(next.phase);
    setNotice('Đã tham gia phòng ' + codeClean + '!');
  } catch (error) {
    console.error('Join room failed:', error);

    setNotice(
      error.message ||
      'Không kết nối được backend. Hãy kiểm tra Terminal.'
    );
  } finally {
    setBusy(false);
  }
};
  const startGame = async () => {
    if(!isHost || players.length<5) return setNotice('Cần ít nhất 5 người để bắt đầu.');
    const list=shuffle(presets[Math.min(15,Math.max(10,players.length))] || presets[10]).slice(0,players.length);
    const shuffledPlayers=shuffle(players).map((p,i)=>({...p,role:list[i] || 'Dân làng',alive:true}));
    const next={...room,players:shuffledPlayers,phase:'night',round:1,nightActions:{},votes:{}};
    setPhase('night'); setRound(1); setVotes({}); setSelected('');
    setLog(['Mọi người nhắm mắt. Đêm 1 bắt đầu.']);
    await updateRoom(next);
  };
  const sendAction = async (action, targetId) => {
    if(!room || !currentMe) return;
    const actions={...(room.nightActions||{}),[currentMe.id]:{action,targetId}};
    const next={...room,nightActions:actions};
    await updateRoom(next);
    setNotice('Đã ghi nhận lựa chọn của em.');
    setSelected('');
    if(channelRef.current) await channelRef.current.send({type:'broadcast',event:'room_action',payload:{message:`${currentMe.name} đã gửi hành động bí mật.`}});
  };
  const resolveNight = async () => {
    const actions=Object.values(room.nightActions||{});
    const wolfTargets=actions.filter(a=>a.action==='kill').map(a=>a.targetId);
    const protectedTargets=actions.filter(a=>a.action==='protect').map(a=>a.targetId);
    const savedTargets=actions.filter(a=>a.action==='save').map(a=>a.targetId);
    const tally={}; wolfTargets.forEach(t=>tally[t]=(tally[t]||0)+1);
    const victim=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    let killed=victim && !protectedTargets.includes(victim) && !savedTargets.includes(victim) ? victim : null;
    const updated=room.players.map(p=>({...p,alive:killed===p.id?false:p.alive}));
    const wolves=updated.filter(p=>p.alive&&p.role==='Ma Sói').length;
    const villagers=updated.filter(p=>p.alive&&p.role!=='Ma Sói').length;
    const winner=wolves===0?'Dân làng thắng!':wolves>=villagers?'Phe Sói thắng!':null;
    const next={...room,players:updated,phase:winner?'ended':'day',round:room.round||1,nightActions:{},winner};
    setPhase(next.phase); setRoom(next);
    const victimName=room.players.find(p=>p.id===killed)?.name;
    setLog(prev=>[killed?`Bình minh: ${victimName} đã bị loại.`:'Bình minh: Không có ai bị loại trong đêm qua.',...prev].slice(0,8));
    if(supabase&&channelRef.current) await channelRef.current.send({type:'broadcast',event:'room_state',payload:{room:next}});
  };
  const castVote = async () => {
    if(!selected) return setNotice('Chọn một người để bỏ phiếu nhé.');
    const nextVotes={...(room.votes||{}),[currentMe.id]:selected};
    const next={...room,votes:nextVotes};
    await updateRoom(next); setVotes(nextVotes);
    setNotice('Đã ghi nhận phiếu của em.');
  };
  const resolveVote = async () => {
    const tally={}; Object.values(room.votes||{}).forEach(t=>tally[t]=(tally[t]||0)+1);
    const target=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    const updated=room.players.map(p=>({...p,alive:target===p.id?false:p.alive}));
    const wolves=updated.filter(p=>p.alive&&p.role==='Ma Sói').length, villagers=updated.filter(p=>p.alive&&p.role!=='Ma Sói').length;
    const winner=wolves===0?'Dân làng thắng!':wolves>=villagers?'Phe Sói thắng!':null;
    const next={...room,players:updated,phase:winner?'ended':'night',round:(room.round||1)+1,nightActions:{},votes:{},winner};
    await updateRoom(next); setPhase(next.phase); setRound(next.round);
    setLog(prev=>[target?`Kết quả bỏ phiếu: ${room.players.find(p=>p.id===target)?.name} bị loại.`:'Không có kết quả bỏ phiếu.',...prev].slice(0,8));
  };
  const toggleMic = async () => {
    if(!voiceOn){
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        localStream.current=stream; setVoiceOn(true); setMuted(false);
        setNotice('Đã cấp quyền mic trên thiết bị này. Âm thanh chưa truyền tới người khác trong bản MVP.');
      }catch{setNotice('Không mở được mic. Hãy cấp quyền micro cho trình duyệt và dùng HTTPS.')}
    }else{
      const next=!muted; localStream.current?.getAudioTracks().forEach(t=>t.enabled=!next); setMuted(next);
    }
  };
  const copyInvite=async()=>{const link=location.origin+location.pathname+'?room='+room.code; try{await navigator.clipboard.writeText(link);setNotice('Đã sao chép link mời.')}catch{setNotice(link)}};
  useEffect(()=>{const q=new URLSearchParams(location.search).get('room');if(q)setRoomCode(q.toUpperCase())},[]);
  const demoRoom = !isOnline;
  return <div className="app-shell">
    <div className="grain"/>
    <header className="topbar"><div className="brand"><div className="brand-mark"><Moon size={20}/></div><div><div className="brand-title">ĐÊM TRĂNG ĐỎ</div><div className="brand-sub">MA SÓI ONLINE · BẢN THỬ NGHIỆM</div></div></div><div className="top-status"><span className={`status-dot ${isOnline?'live':''}`}/>{isOnline?'DỊCH VỤ ĐÃ CẤU HÌNH':'CHẾ ĐỘ DEMO'}<span className="divider-v"/> <span className="lang">VI</span></div></header>
    {!room ? <main className="landing">
      <section className="hero"><div className="eyebrow"><Sparkles size={14}/> ĐÊM XUỐNG, BÍ MẬT THỨC TỈNH</div><h1>Trong bóng tối,<br/><em>ai là kẻ nói dối?</em></h1><p className="hero-copy">Tập hợp hội bạn. Nhận vai bí mật. Sống sót qua đêm dài.<br/>Chỉ một lời nói sai — cả ngôi làng có thể sụp đổ.</p><div className="moon-art"><div className="moon-glow"/><div className="blood-moon"/><div className="ridge ridge-back"/><div className="ridge ridge-front"/><div className="wolf-silhouette">♟</div></div></section>
      <section className="entry-card"><div className="card-top"><span className="mini-label">BẮT ĐẦU CUỘC SĂN</span><span className="players-label"><Users size={14}/> 10–15 NGƯỜI</span></div><label>TÊN CỦA EM</label><input value={name} onChange={e=>setName(e.target.value)} maxLength={18} placeholder="Ví dụ: Sói con..." onKeyDown={e=>e.key==='Enter'&&createRoom()}/><button className="primary-btn" disabled={busy} onClick={createRoom}><Moon size={17}/> TẠO PHÒNG MỚI <ChevronRight size={17}/></button><div className="or"><span/> HOẶC THAM GIA <span/></div><label>MÃ PHÒNG</label><div className="join-row"><input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} maxLength={8} placeholder="VD: LUNA7"/><button className="join-btn" onClick={joinRoom} disabled={busy}><DoorOpen size={16}/> VÀO PHÒNG</button></div>{notice&&<div className="notice">{notice}</div>}<div className="secure-note"><Shield size={13}/> Vai trò cần được giữ bí mật. Đừng để người khác nhìn màn hình.</div></section>
      <div className="feature-strip"><div><Users/><strong>Phòng riêng</strong><span>Mời bạn bằng mã</span></div><div><Eye/><strong>Vai bí mật</strong><span>Mỗi người một vai</span></div><div><Mic/><strong>Trò chuyện</strong><span>Mic đang phát triển</span></div></div>
    </main> : <main className="game-layout">
      <div className="game-head"><div><div className="eyebrow"><Sparkles size={13}/> PHÒNG SINH TỒN</div><h2>PHÒNG <em>{room.code}</em></h2><p>Chủ phòng: {players.find(p=>p.id===room.hostId)?.name||'—'} · {players.length}/15 người</p></div><button className="ghost-btn" onClick={copyInvite}><Copy size={15}/> MỜI BẠN</button></div>
      {!isOnline&&<div className="warning"><CircleHelp size={17}/><span><b>Đang ở chế độ demo.</b> Phòng chưa đồng bộ qua Internet; hãy cấu hình Supabase theo README để bật kết nối thật.</span></div>}
      <div className="game-columns"><section className="panel"><div className="panel-title"><Users size={16}/> DÂN LÀNG <span>{players.length}</span></div><div className="player-grid">{players.map((p,i)=><div className={`player-card ${!p.alive?'dead':''}`} key={p.id}><div className="avatar">{p.role?getRole(p.role).icon:'?'}</div><div className="player-name">{p.name}{p.id===me?.id?' (em)':''}</div><div className="player-state">{p.id===room.hostId?'CHỦ PHÒNG':p.alive?'ĐANG SỐNG':'ĐÃ BỊ LOẠI'}</div>{p.id===me?.id&&myRoleName&&<div className="role-pill">{myRoleInfo.icon} {myRoleName}</div>}</div>)}</div>
      {isHost&&room.phase==='lobby'&&<button className="primary-btn wide" onClick={startGame}>CHIA VAI & BẮT ĐẦU <ChevronRight size={17}/></button>}
      {room.phase==='lobby'&&<p className="hint">Chờ mọi người tham gia. Chủ phòng bắt đầu khi nhóm sẵn sàng.</p>}</section>
      <aside className="side-stack"><section className="panel phase-panel"><div className="panel-title"><Moon size={16}/> TRẠNG THÁI VÁN</div><div className="phase-icon">{room.phase==='night'?<Moon size={28}/>:room.phase==='day'?<Sun size={28}/>:<Skull size={28}/>}</div><h3>{room.phase==='lobby'?'CHỜ NGƯỜI CHƠI':room.phase==='night'?`ĐÊM THỨ ${room.round}`:room.phase==='day'?'THẢO LUẬN BAN NGÀY':'KẾT THÚC VÁN'}</h3><p>{room.phase==='lobby'?'Màn đêm đang chờ đợi...':room.phase==='night'?'Hãy chọn hành động bí mật của vai em.':room.phase==='day'?'Thảo luận rồi bỏ phiếu cho người đáng nghi.':room.winner}</p>
      {room.phase==='night'&&currentMe?.alive&&myRoleName&&<div className="action-box"><label>HÀNH ĐỘNG CỦA EM</label><div className="action-hint">{myRoleInfo.desc}</div>{myRoleName==='Ma Sói'&&<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Chọn mục tiêu...</option>{alive.filter(p=>p.role!=='Ma Sói').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}{['Tiên tri','Bảo vệ','Phù thủy'].includes(myRoleName)&&<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Chọn người...</option>{alive.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}{myRoleName==='Dân làng'&&<p className="hint">Đêm nay em không có hành động đặc biệt.</p>}{myRoleName==='Thợ săn'&&<p className="hint">Khả năng đặc biệt kích hoạt khi bị loại (chưa hoàn thiện trong MVP).</p>}{myRoleName==='Ma Sói'&&<button className="primary-btn wide" onClick={()=>sendAction('kill',selected)} disabled={!selected}>CHỌN MỤC TIÊU</button>}{myRoleName==='Tiên tri'&&<button className="primary-btn wide" onClick={()=>{const p=players.find(p=>p.id===selected);setNotice(p?`${p.name} ${p.role==='Ma Sói'?'là Ma Sói':'không phải Ma Sói'}.`:'Chọn một người trước nhé.');sendAction('inspect',selected)}} disabled={!selected}>SOI NGƯỜI NÀY</button>}{myRoleName==='Bảo vệ'&&<button className="primary-btn wide" onClick={()=>sendAction('protect',selected)} disabled={!selected}>BẢO VỆ</button>}{myRoleName==='Phù thủy'&&<button className="primary-btn wide" onClick={()=>sendAction('save',selected)} disabled={!selected}>DÙNG BÌNH CỨU (DEMO)</button>}{isHost&&<button className="secondary-btn wide" onClick={resolveNight}>QUẢN TRÒ: BÌNH MINH</button>}</div>}
      {room.phase==='day'&&<div className="action-box"><label>BỎ PHIẾU</label><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Chọn người bị nghi...</option>{alive.filter(p=>p.id!==me?.id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="primary-btn wide" onClick={castVote} disabled={!selected}>GỬI LÁ PHIẾU</button>{isHost&&<button className="secondary-btn wide" onClick={resolveVote}>QUẢN TRÒ: CÔNG BỐ KẾT QUẢ</button>}</div>}
      {room.phase==='ended'&&<button className="primary-btn wide" onClick={()=>{const next={...room,phase:'lobby',players:room.players.map(p=>({...p,role:null,alive:true})),round:1,winner:null};updateRoom(next);setPhase('lobby')}}>CHƠI VÁN MỚI</button>}</section>
      <section className="panel voice-panel"><div className="panel-title"><Volume2 size={16}/> THOẠI TRỰC TIẾP <span className="soon">MVP</span></div><p>Cho phép trình duyệt dùng micro. Truyền âm thanh giữa người chơi cần bổ sung WebRTC + signaling server.</p><button className={voiceOn&&!muted?'mic-btn active':'mic-btn'} onClick={toggleMic}>{voiceOn&&!muted?<Mic size={17}/>:<MicOff size={17}/>} {voiceOn&&!muted?'TẮT MIC':'BẬT MIC'}</button><div className="hint">Bản hiện tại chưa phát âm thanh tới người khác.</div></section>
      <section className="panel log-panel"><div className="panel-title"><Sparkles size={16}/> NHẬT KÝ</div>{log.map((l,i)=><p key={i} className="log-line">{l}</p>)}</section></aside></div>
      {notice&&<div className="notice sticky-notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
    </main>}
    <footer><div>ĐÊM TRĂNG ĐỎ <span>© 2026 · FAN-MADE WEREWOLF</span></div><span>CHƠI VUI · GIỮ BÍ MẬT · TIN VÀO BẢN NĂNG</span></footer>
  </div>;
}