var key_element = document.getElementById('key');
var enc_form = document.getElementById('enc_form');
var enc_form_inner = document.getElementById('enc_form_inner');
var selector = document.getElementById('selector');
var select_type = 'html';

const html_form = `
    <textarea id="message" name="message" placeholder="Enter message here" rows="5" cols="60"></textarea>
`
const video_form = `
    <textarea id="message" name="message" placeholder="Enter video URL here" rows="1" cols="60"></textarea>
`
const image_form = `
    <textarea id="message" name="message" placeholder="Enter image URL here" rows="1" cols="60"></textarea>
`
function update_selector() {
    switch(select_type) {
        case 'html':
            enc_form_inner.innerHTML = html_form;
            break;
        case 'video':
            enc_form_inner.innerHTML = video_form;
            break;
        case 'image':
            enc_form_inner.innerHTML = html_form;
            break;
    }
}
selector.addEventListener('change', update_selector);
update_selector();

chrome.storage.local.get('key', function(obj){
    key_element.value = obj.key;
});

function key_changed() {
    chrome.storage.local.set({key: key_element.value}, function(){});
}

async function do_encode() {
    let message = document.getElementById('message').value;
    let key = key_element.value;
    encode_file_image(message, key);
}

key_element.addEventListener('change', key_changed);
document.addEventListener('unload', function(event){
    key_changed();
}, true);
enc_form.addEventListener('submit', async function(event){
    event.preventDefault();
    do_encode();
}, true);
