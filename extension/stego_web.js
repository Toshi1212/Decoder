// Support nullptr in code.
const memory_base = 16;
// 512 * 64k = 32MB.
let memory = new WebAssembly.Memory({ initial: 512 });

function Base64Decode(str) {
    var raw = atob(str);
    var arr = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) {
        arr[i] = raw.charCodeAt(i);
    }
    return arr;
}

function toMemoryUint32(arr, offset) {
    let i32 = new Uint32Array(memory.buffer);
    for (let i = 0; i < arr.length; i++) {
        i32[i + offset] = arr[i];
    }
}

function fromMemoryUint32(offset, length) {
    let i32 = new Uint32Array(memory.buffer);
    let out = new Uint32Array(length);
    for (let i = 0; i < length; i++) {
        out[i] = i32[offset + i];
    }
    return out;
}

function toMemoryUint8(arr, offset) {
    let i8 = new Uint8Array(memory.buffer);
    for (let i = 0; i < arr.length; i++) {
        i8[i + offset] = arr[i];
    }
}

function fromMemoryUint8(offset, length) {
    let i8 = new Uint8Array(memory.buffer);
    let out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        out[i] = i8[offset + i];
    }
    return out;
}

function toMemoryString(str, offset) {
    let encoder = new TextEncoder();
    let data = encoder.encode(str);
    toMemoryUint8(data, offset);
    return data.length;
}

function fromMemoryString(offset, length) {
    let i8 = new Uint8Array(memory.buffer);
    let arr = i8.slice(offset, offset + length);
    let decoder = new TextDecoder('utf-8');
    return decoder.decode(arr);
}

function memset(dest, ch, count) {
    let i8 = new Uint8Array(memory.buffer);
    const final_dest = dest + count;
    for (let i = dest; i < final_dest; i++) {
        i8[i] = ch;
    }
}

function memcpy(dest, src, count) {
    let i8 = new Uint8Array(memory.buffer);
    const final_dest = dest + count;
    let j = src;
    for (let i = dest; i < final_dest; i++) {
        i8[i] = i8[j++];
    }
}

function bswap32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}

function hex_string(arr) {
    let s = "";
    for (a of arr) {
        s = s + (a >>> 0).toString(16);
    }
    return s;
}

var vertex_shader_src = `
	attribute float x_pos;
    uniform float y_pos;
    uniform vec2 resolution;
    varying float x_out;

	void main() {
        x_out = x_pos;
        gl_Position = vec4(-1. + 2. * x_pos / resolution.x, 1. - 2. * y_pos / resolution.y, 0, 1);
        gl_PointSize = 1.0;
	}
`;

var frag_shader_src = `
    precision highp float;
	varying float x_out;
    uniform float y_pos;
    uniform vec2 resolution;
    uniform sampler2D u_texture;

    void main() {
          gl_FragColor = texture2D(u_texture, vec2(x_out / resolution.x, y_pos / resolution.y));
    }  
`;

function create_shader(gl, type, source) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

function create_program(gl, vertex_shader, frag_shader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertex_shader);
    gl.attachShader(program, frag_shader);
    gl.linkProgram(program);
    let success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        return program;
    }
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
}

function getRawPixelsGl(url, callback) {
    // Uses a memory canvas to obtain raw pixel data.
    let canvas = document.createElement('canvas');
    let gl = canvas.getContext('webgl');
    if (!gl) {
        console.log("Browser must support WebGL");
        return;
    }
    let img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = function() {
		gl.viewport(0, 0, img.width, img.height);
		let texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		let fb = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D, texture, 0);
		let canRead = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (canRead) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
			let data = new Uint8Array(img.width * img.height * 4);
			gl.readPixels(0, 0, img.width, img.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			callback({
				data: data,
				width: img.width,
				height: img.height
			}, url);
		} else {
			return null;
		}
    }
}

function encodePNGGl(pixels) {
    let canvas = document.createElement('canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    let gl = canvas.getContext('webgl', {
        premultipliedAlpha: false,
        perserveDrawingBuffer: true,
        antialias: false,
    });
    if (!gl) {
        console.log("Browser must support WebGL");
        return;
    }

    let vertex_shader = create_shader(gl, gl.VERTEX_SHADER, vertex_shader_src);
    let frag_shader = create_shader(gl, gl.FRAGMENT_SHADER, frag_shader_src);
    let program = create_program(gl, vertex_shader, frag_shader);

    let resolution = gl.getUniformLocation(program, "resolution");
    let texture_loc = gl.getUniformLocation(program, "u_texture");
    let y_pos = gl.getUniformLocation(program, "y_pos");
    let x_pos = gl.getAttribLocation(program, "x_pos");

    // Create texture
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    {
        const level = 0;
        const internal_format = gl.RGBA;
        const width = pixels.width;
        const height = pixels.height;
        const border = 0;
        const src_format = gl.RGBA;
        const src_type = gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, level, internal_format, width, height, border,
                      src_format, src_type, pixels.data);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Transfer attribs. We want to force every point to be drawn.
    let x_pos_array = [];
    x_pos_array.length = canvas.width;
    for (let x = 0; x < canvas.width; x++) {
        // 0.5 so that it's centered on the pixel.
        x_pos_array[x] = x + 0.5;
    }
    let x_pos_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, x_pos_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(x_pos_array), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Use program and bind stuff.
    gl.useProgram(program);

    // Activate texture unit 0.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Assign texture to unit zero.
    gl.uniform1i(texture_loc, 0);

    // Set up the x_pos array.
    {
        gl.bindBuffer(gl.ARRAY_BUFFER, x_pos_buffer);
        let size = 1;             // 1 component
        let array_type = gl.FLOAT // It's a float
        let normalize = false;    // don't normalize it please.
        let stride = 0;           // No stride between values.
        let offset = 0;           // No offset either.
        gl.vertexAttribPointer(x_pos, size, array_type, normalize, stride, offset);
        gl.enableVertexAttribArray(x_pos);
    }

    // Set up the resolution
    gl.uniform2f(resolution, canvas.width, canvas.height);

    // Clear buffer.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (let y = 0; y < canvas.height; y++) {
        // Set up y position.
        gl.uniform1f(y_pos, y + 0.5);
        // Draw the pixels.
        let primitive_type = gl.POINTS;
        let offset = 0;
        let count = canvas.width;
        gl.drawArrays(primitive_type, offset, count);
    }
    return canvas.toDataURL('image/png');
}

function randomUint32() {
    var rand = new Uint32Array(1);
    window.crypto.getRandomValues(rand);
    return rand[0];
}

async function StegoInterface() {
    let imports = { env: {} };
    imports.env.__memory_base = memory_base;
    imports.env.memory = memory;
    imports.env._memset = memset;
    imports.env._memcpy = memcpy;
    imports.env._llvm_bswap_i32 = bswap32;
    imports.env._log_value = function(marker, value) {
        console.log("Marker %d: %d", marker, value);
    }
    imports.env._get_random32 = randomUint32;
    const stego_web = Base64Decode(stego_raw);
    const {module, instance} = await WebAssembly.instantiate(stego_web, imports);
    instance.exports.__post_instantiate();
    var get_max_capacity = instance.exports._get_max_capacity;
    var get_capacity = instance.exports._get_capacity;
    var stego_read = instance.exports._stego_read;
    var stego_write = instance.exports._stego_write;
    var special_hash = instance.exports._special_hash;
    const header_size = 32;

    let read_pixels = function(pixels, key) {
        // Arbitrarily high pointer.
        let mem_start_ptr = 65536;
        let pixel_ptr = mem_start_ptr;
        toMemoryUint8(pixels.data, pixel_ptr);
        let pixel_size = pixels.width * pixels.height * 4;
        let stream_ptr = pixel_ptr + pixel_size;
        let stream_max_size = get_max_capacity(pixels.width, pixels.height);
        let key_ptr = stream_ptr + stream_max_size;
        let key_size = toMemoryString(key, key_ptr);
        let message_len = stego_read(pixel_ptr, pixels.width, pixels.height, key_ptr, key_size, stream_ptr);
        if (message_len == -1) {
            return {
                message: null,
                type: -1,
            }
        }
        let header = fromMemoryUint8(stream_ptr, header_size);
        let header_view = new DataView(new ArrayBuffer(header.length));
        for (let i = 0; i < header.length; i++) {
            header_view.setInt8(i, header[i]);
        }
        let type = header_view.getUint32(24, true);
        return {
            message: fromMemoryString(stream_ptr + header_size, message_len),
            type: type,
        };
    };

    let write_pixels = function(pixels, message, key, type = 0, transparency = true) {
        let mem_start_ptr = 65536;
        let pixel_ptr = mem_start_ptr;
        toMemoryUint8(pixels.data, pixel_ptr);
        let key_ptr = mem_start_ptr + pixels.width * pixels.height * 4;
        let key_size = toMemoryString(key, key_ptr);
        let message_ptr = key_ptr + key_size;
        let message_size = toMemoryString(message, message_ptr);
        let scratch_ptr = message_ptr + message_size;
        let scratch_size = header_size + message_size;
        let transparency_bool = (transparency) ? 1 : 0
        let ret = stego_write(pixel_ptr, pixels.width, pixels.height, key_ptr, key_size, message_ptr, message_size, type, scratch_ptr, transparency_bool);
        if (ret != 0) {
            return null;
        }
        return {
            data: fromMemoryUint8(pixel_ptr, pixels.width * pixels.height * 4),
            width: pixels.width,
            height: pixels.height
        }
    };

    let read_url = function(url, key, callback) {
        getRawPixelsGl(url, function(pixels, url) {
            let {message, type} = read_pixels(pixels, key);
            callback(message, type);
        });
    }

    let write_url = function(url, message, key, type, transparency, callback) {
        getRawPixelsGl(url, function(pixels, url) {
            let data = write_pixels(pixels, message, key, type, transparency);
            callback(data);
        });
    }

    return {
        module: module,
        instance: instance,
        read_pixels: read_pixels,
        read_url: read_url,
        write_pixels: write_pixels,
        write_url: write_url
    };
}

function decode_status(s) {
    let decode_status = document.getElementById('decode_status');
    let decode_container = document.getElementById('decode_container');
    decode_status.innerHTML= s;
    decode_container.style.display = 'none';
    decode_status.style.display = '';
}

function decode_show(img_url, s) {
    let decode_status = document.getElementById('decode_status');
    let decode_container = document.getElementById('decode_container');
    let decode_image = document.getElementById('decode_image');
    let decode_output = document.getElementById('decode_output');
    decode_status.style.display = 'none';
    decode_image.src = img_url;
    decode_output.innerHTML = s;
    decode_container.style.display = '';
}

async function decode_image(img_url, key) {
    let stego = await StegoInterface();
    stego.read_url(img_url, key, function(message, type){
        if (message === null) {
            decode_status('<p><b>Invalid image or password.</b></p>');
        } else {
            decode_show(img_url, message);
        }
    });
}

async function decode_file_image(key) {
    var file = document.getElementById('decode_file').files[0];
    var r = new FileReader(); 
    decode_status('<p>Loading image...</p>');
    r.onload = function() {
        decode_status('<p>Decoding image...</p>');
        decode_image(r.result, key);
    }
    r.readAsDataURL(file);
}

async function encode_image_text(img_url, message, key) {
    let stego = await StegoInterface();
    let transparency = true;
    let type_text = 0; // Type 0 is pure text.
    let encode_status = document.getElementById('encode_status');
    let encode_output = document.getElementById('encode_output');
    let encode_a = document.getElementById('encode_a');
    stego.write_url(img_url, message, key, type_text, transparency, function(data) {
        if (data === null) {
            encode_status.innerHTML= '<p><b>Encoding failed.</b></p>';
        } else {
            let canvasURL = encodePNGGl(data);
            encode_output.src = canvasURL;
            encode_a.download = Date.now() + '.png';
            encode_a.href = canvasURL;
            encode_output.style.display = '';
            encode_status.innerHTML= 'If click-downloading fails (too large an image?), right click and save the above encoded image.';
        }
    });
}

async function encode_file_image(message, key) {
    document.getElementById('encode_output').style.display = 'none';
    document.getElementById('encode_status').innerHTML= 'Encoding image...';
    var file = document.getElementById('encode_file').files[0];
    var r = new FileReader();
    r.onload = function() {
        encode_image_text(r.result, message, key);
    }
    r.readAsDataURL(file);
}
