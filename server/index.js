
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'node:crypto';
dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors({
  origin: 'http://localhost:5173'
}));

app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : null;

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend Ma Sói đang hoạt động!'
  });
});

app.get('/api/health/supabase', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({
      success: false,
      message: 'Thiếu cấu hình Supabase trong server/.env'
    });
  }

  try {
    const { error, count } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error('Supabase check failed:', error.message);

      return res.status(500).json({
        success: false,
        message: 'Chưa truy vấn được bảng rooms. Hãy kiểm tra Terminal.'
      });
    }

    res.json({
      success: true,
      message: 'Backend đã kết nối Supabase!',
      roomsTableAccessible: true,
      roomCount: count
    });
  } catch (error) {
    console.error('Connection check failed:', error.message);

    res.status(500).json({
      success: false,
      message: 'Có lỗi khi kết nối Supabase.'
    });
  }
});

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  const bytes = randomBytes(6);
  return Array.from(
    bytes,
    byte => ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]
  ).join('');
}

app.post('/api/rooms', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({
      success: false,
      message: 'Supabase chưa được cấu hình.'
    });
  }

  const displayName =
    typeof req.body?.displayName === 'string'
      ? req.body.displayName.trim()
      : '';

  if (displayName.length < 2 || displayName.length > 20) {
    return res.status(400).json({
      success: false,
      message: 'Tên người chơi phải dài từ 2 đến 20 ký tự.'
    });
  }

  let room = null;

  // Tao ma phong, thu toi da 5 lan neu bi trung
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();

    const result = await supabase
      .from('rooms')
      .insert({
        code,
        status: 'waiting',
        phase: 'lobby',
        settings: {}
      })
      .select('id, code, status, phase')
      .single();

    if (!result.error) {
      room = result.data;
      break;
    }

    if (result.error.code !== '23505') {
      console.error('Create room failed:', result.error.message);
      return res.status(500).json({
        success: false,
        message: 'Chưa tạo được phòng. Hãy kiểm tra Terminal.'
      });
    }
  }

  if (!room) {
    return res.status(500).json({
      success: false,
      message: 'Chưa tạo được mã phòng duy nhất. Hãy thử lại.'
    });
  }

  const sessionToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256')
    .update(sessionToken)
    .digest('hex');

  try {
    // Tao nguoi choi dau tien, dong thoi la chu phong
    const { data: player, error: playerError } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        display_name: displayName,
        seat_number: 1
      })
      .select('id, display_name, seat_number')
      .single();

    if (playerError) throw playerError;

    // Chi luu hash cua token trong database
    const { data: session, error: sessionError } = await supabase
      .from('player_sessions')
      .insert({
        room_id: room.id,
        player_id: player.id,
        session_token_hash: tokenHash
      })
      .select('id')
      .single();

    if (sessionError) throw sessionError;

    // Luu phien cua chu phong vao phong
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ host_session_id: session.id })
      .eq('id', room.id);

    if (updateError) throw updateError;

    return res.status(201).json({
      success: true,
      room: {
        id: room.id,
        code: room.code,
        status: room.status,
        phase: room.phase
      },
      player,
      sessionToken
    });
  } catch (error) {
    console.error('Room setup failed:', error.message);

    // Don phong neu tao nguoi choi hoac phien bi loi
    await supabase.from('rooms').delete().eq('id', room.id);

    return res.status(500).json({
      success: false,
      message: 'Phòng được khởi tạo chưa hoàn tất. Hãy thử lại.'
    });
  }
});

app.post('/api/rooms/:code/join', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({
      success: false,
      message: 'Supabase chưa được cấu hình.'
    });
  }

  const code = String(req.params.code || '').trim().toUpperCase();
  const displayName =
    typeof req.body?.displayName === 'string'
      ? req.body.displayName.trim()
      : '';

  if (displayName.length < 2 || displayName.length > 20) {
    return res.status(400).json({
      success: false,
      message: 'Tên người chơi phải dài từ 2 đến 20 ký tự.'
    });
  }

  try {
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, code, status, phase')
      .eq('code', code)
      .maybeSingle();

    if (roomError) throw roomError;

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng này.'
      });
    }

    if (room.status !== 'waiting' || room.phase !== 'lobby') {
      return res.status(400).json({
        success: false,
        message: 'Phòng đã bắt đầu ván chơi hoặc không nhận thêm người.'
      });
    }

    const { data: currentPlayers, error: listError } = await supabase
      .from('room_players')
      .select('id, seat_number')
      .eq('room_id', room.id)
      .order('seat_number', { ascending: false })
      .limit(1);

    if (listError) throw listError;

    const seatNumber = (currentPlayers?.[0]?.seat_number || 0) + 1;

    if (seatNumber > 15) {
      return res.status(400).json({
        success: false,
        message: 'Phòng đã đủ 15 người.'
      });
    }

    const { data: player, error: playerError } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        display_name: displayName,
        seat_number: seatNumber
      })
      .select('id, display_name, seat_number, is_alive')
      .single();

    if (playerError) throw playerError;

    const sessionToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const { error: sessionError } = await supabase
      .from('player_sessions')
      .insert({
        room_id: room.id,
        player_id: player.id,
        session_token_hash: tokenHash
      });

    if (sessionError) {
      await supabase.from('room_players').delete().eq('id', player.id);
      throw sessionError;
    }

    return res.status(201).json({
      success: true,
      room,
      player,
      sessionToken
    });
  } catch (error) {
    console.error('Join room failed:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Chưa tham gia được phòng. Hãy kiểm tra Terminal.'
    });
  }
});
app.get('/api/rooms/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, code, status, phase')
      .eq('code', code)
      .maybeSingle();

    if (roomError) throw roomError;

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng.'
      });
    }

    const { data: players, error: playersError } = await supabase
      .from('room_players')
      .select('id, display_name, seat_number, is_alive')
      .eq('room_id', room.id)
      .order('seat_number', { ascending: true });

    if (playersError) throw playersError;

    res.json({
      success: true,
      room,
      players: players || []
    });
  } catch (error) {
    console.error('Get room failed:', error);

    res.status(500).json({
      success: false,
      message: 'Không tải được danh sách người chơi.'
    });
  }
});
app.listen(PORT, () => {
  console.log(`Backend đang chạy tại http://localhost:${PORT}`);
});