import { FormData } from 'formdata-node';
import axios from 'axios';

const linksConvert = {
    // Define all conversion links and parameters here...
};

async function convert(fields) {
    if (typeof fields === 'string' && fields.toLowerCase() === 'list') return Object.keys(linksConvert);

    const type = linksConvert?.[fields?.type];
    if (!type) throw new Error(`Invalid conversion type "${fields?.type}"`);

    const form = new FormData();

    if (fields?.file) {
        if (!fields.filename) throw new Error(`Filename must be provided to upload files (with extension)`);
        form.append('new-image', fields.file, { filename: fields.filename });
    } else if (fields?.url) {
        form.append('new-image-url', fields.url);
    } else {
        throw new Error('Either file or url field is required.');
    }

    delete fields.type;
    delete fields.file;
    delete fields.filename;
    delete fields.url;

    const org_keys = Object.keys(fields);
    if (type.req_params) {
        type.req_params.forEach(param => {
            if (!org_keys.includes(param)) throw new Error(`"${param}" is a required param.`);
        });
    }
    if (type.either_params.length) {
        let check = false;
        type.either_params.forEach(param => {
            if (org_keys.includes(param)) check = true;
        });
        if (!check) throw new Error(`Either one of these params has to be provided: ${type.either_params.join(', ')}`);
    }

    const link = await axios({
        method: 'post',
        url: type.url,
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        data: form,
    }).catch(handleAxiosError);

    const redir = String(link?.request?.res?.responseUrl);
    if (!redir) throw new Error(`Unknown error occurred during redirection.`);
    const id = redir.split('/').pop();
    type.params.file = id;

    const image = await axios({
        method: 'post',
        url: `${redir}?ajax=true`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: new URLSearchParams({
            ...type.params,
            ...fields,
        }),
    }).catch(handleAxiosError);

    const img_url = extractImageUrl(image, type.split.start, type.split.end);
    if (!img_url) throw new Error(`Failed to extract image URL.`);
    return img_url;
}

async function overlay(fields) {
    const form = new FormData();
    const form_over = new FormData();
    form.append('new-image', fields.file, { filename: fields.filename });

    const link = await axios({
        method: 'post',
        url: 'https://ezgif.com/overlay',
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        data: form,
    }).catch(handleAxiosError);

    const redir = String(link?.request?.res?.responseUrl);
    if (!redir) throw new Error(`Unknown error occurred during redirection.`);
    const id = redir.split('/').pop();

    form_over.append('new-overlay', Buffer.from(fields.overlay.file), {
        filename: `${fields.overlay.filename}`,
    });
    form_over.append('overlay', 'Upload image!');

    const link_over = await axios({
        method: 'post',
        url: redir,
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        data: form_over,
    }).catch(handleAxiosError);

    const redir_over = String(link_over?.request?.res?.responseUrl);
    if (!redir_over) throw new Error(`Unknown error occurred during overlay redirection.`);
    const id_over = redir_over.split('/').pop();

    const image = await axios({
        method: 'post',
        url: `${redir_over}?ajax=true`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: new URLSearchParams({
            file: id,
            'overlay-file': id_over,
            posX: fields.x || 0,
            posY: fields.y || 0,
        }),
    }).catch(handleAxiosError);

    const img_url = extractImageUrl(image, '<img src="', '" style="width');
    if (!img_url) throw new Error(`Failed to extract image URL.`);
    return img_url;
}

const linksRender = {
    // Define all rendering links here...
};

async function render(fields) {
    const type = linksRender?.[fields?.type];
    if (!type) throw new Error(`Invalid rendering type "${fields?.type}"`);

    const form = new FormData();
    const defaultParams = {
        delay: 20,
        dfrom: 1,
        dto: 5,
        'fader-delay': 6,
        'fader-frames': 10,
        loop: 0,
        'delays[]': [],
        'files[]': [],
    };
    fields = {
        ...defaultParams,
        ...fields,
    };

    for (let i = 0; i < fields.files.length; i++) {
        if (!fields.files[i].data) throw new Error(`File buffer not provided for files[${i}]`);
        if (!fields.files[i].name) throw new Error(`File name not provided for files[${i}]`);
        form.append('files[]', fields.files[i].data, { filename: fields.files[i].name });
        fields['delays[]'].push(fields.files[i].delay ?? fields.delay);
    }

    delete fields.type;
    delete fields.files;

    form.append('msort', '1');
    form.append('upload', 'Upload and make a GIF!');

    const link = await axios({
        method: 'post',
        url: type,
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        data: form,
    }).catch(handleAxiosError);

    const redir = String(link?.request?.res?.responseUrl);
    if (!redir) throw new Error(`Unknown error occurred during redirection.`);
    fields.file = redir.split('/').pop();

    const html = await axios.get(redir);
    html.data
        .toString()
        .split('(drag and drop frames to change order)')[1]
        .split('<p class="options"><strong>Toggle a range of frames:</strong>')[0]
        .split('<span class="frame-tools">')
        .slice(0, -1)
        .map(frame => frame.split('value="')[1].split('" name="files[]"')[0])
        .forEach(frame => fields['files[]'].push(frame));

    const image = await axios({
        method: 'post',
        url: `${redir}?ajax=true`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: new URLSearchParams(fields),
    }).catch(handleAxiosError);

    const img_url = extractImageUrl(image, '<img src="', '" style="width');
    if (!img_url) throw new Error(`Failed to extract image URL.`);
    return img_url;
}

async function handleAxiosError(error) {
    if (error.response) {
        throw new Error(JSON.stringify({
            statusCode: error.response.status,
            data: error.response.data.length ? error.response.data : "Try again. If it continues, report to the creator.",
        }, null, 4));
    } else {
        throw new Error("Oops, something unknown happened! :(");
    }
}

function extractImageUrl(response, startDelimiter, endDelimiter) {
    return `https:${(response?.data?.toString()?.split(startDelimiter)?.[1]?.split(endDelimiter)?.[0])?.replace('https:', '')}`;
}

async function webp2mp4(url) {
    return await convert({
        type: 'webp-mp4',
        url,
    });
}

async function webp2img(url) {
    return await convert({
        type: 'webp-png',
        url,
    });
}

async function img2webp(url) {
    return await convert({
        type: 'png-webp',
        url,
    });
}

async function vid2webp(url) {
    return await convert({
        type: 'video-webp',
        url,
    });
}

export {
    convert,
    overlay,
    render,
    webp2mp4,
    webp2img,
    img2webp,
    vid2webp,
};
