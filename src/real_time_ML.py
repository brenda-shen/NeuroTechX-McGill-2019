import numpy as np
import matplotlib.mlab as mlab
import socketio

sio = socketio.Client()

buffer_data = []

def predict(ch):
    """
    BASELINE PREDICTION ALGORITHM FOR MVP
    ch has shape (2, 500)
    """
    threshold = 1

    psd1,freqs = mlab.psd(np.squeeze(ch[0]),
                           NFFT=500,
                           Fs=250)
    mu_indices = np.where(np.logical_and(freqs>=7, freqs<=12))
    mu1 = np.mean(psd1[mu_indices])

    psd2,freqs = mlab.psd(np.squeeze(ch[1]),
                           NFFT=500,
                           Fs=250)
    mu2 = np.mean(psd2[mu_indices])

    if mu1 < threshold and mu2>= threshold:
        return "L"  # left
    elif mu1 >= threshold and mu2 < threshold:
        return "R"  # right
    else:
        return "F"  # forward


@sio.on('timeseries-prediction')
def on_message(data):
    global buffer_data
    buffer_data += data['data'] # concatenate lists
    print(len(buffer_data))

    if len(buffer_data) < 500:
        # lacking data
        response = "F" # go forward otherwise
    else:
        # we have enough data to make a prediction
        to_pop = len(buffer_data) - 500
        buffer_data = buffer_data[to_pop:]
        response = predict(data)
    sio.emit('data from ML', {'response': response})


sio.connect('http://localhost:3000')
sio.wait()
