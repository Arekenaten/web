/* eslint-disable no-console */
var combine_secrets = function(secret1, secret2) {
  var shares = [ secret1, secret2 ];

  return secrets.combine(shares);
};

var sign_and_send = function(rawTx, success_callback, private_key) {
  // sign & serialize raw transaction
  var tx = new EthJS.Tx(rawTx);

  tx.sign(new EthJS.Buffer.Buffer.from(private_key, 'hex'));
  var serializedTx = tx.serialize();

  // send raw transaction
  web3.eth.sendRawTransaction('0x' + serializedTx.toString('hex'), success_callback);
};

window.onload = function() {
  ipfs = get_ipfs();
  ipfs.catText(document.ipfs_key_to_secret, function(err, key2) {
    if (err) {
      _alert('could not reach IPFS.  please try again later.', 'error');
      return;
    }
    document.priv_key = combine_secrets(key2, document.gitcoin_secret);
  });
  waitforWeb3(function() {
    if (document.web3network != document.network) {
      _alert({ message: gettext('You are not on the right web3 network.  Please switch to ') + document.network }, 'error');
    } else {
      $('#forwarding_address').val(web3.eth.coinbase);
    }
    $('#network').val(document.web3network);
  });
};

$(document).ready(function() {
  $('#receive').click(function(e) {
    e.preventDefault();

    var forwarding_address = $('#forwarding_address').val();

    if (!$('#tos').is(':checked')) {
      _alert('Please accept TOS.', 'error');
      unloading_button($(this));
      return;
    }
    if (forwarding_address == '0x0' || forwarding_address == '') {
      _alert('Invalid forwarding address.', 'error');
      unloading_button($(this));
      return;
    }
    if (typeof web3 == 'undefined') {
      _alert({ message: gettext('You are not on a web3 browser.  Please switch to a web3 browser.') }, 'error');
      unloading_button($(this));
      return;
    }
    if (document.web3network != document.network) {
      _alert({ message: gettext('You are not on the right web3 network.  Please switch to ') + document.network }, 'error');
      unloading_button($(this));
      return;
    }

    loading_button($(this));

    var success_callback = function(err, txid) {
      unloading_button($(this));
      if (err) {
        _alert(err.message.split('\n')[0], 'error');
      } else {
        document.location.href = window.location.href.split('?')[0] +
        '?receive_txid=' + txid +
        '&forwarding_address=' + $('#forwarding_address').val();
        '&save_addr=' + ($('#save_addr').is(':checked') ? '1' : '0');
      }
    };

    // redeem tip

    var gas_price_wei = document.gas_price * 10 ** 9;
    var is_eth = document.tip['token_address'] == '0x0';
    var token_address = document.tip['token_address'];
    var token_contract = web3.eth.contract(token_abi).at(token_address);
    var holding_address = document.tip['holding_address'];
    var amount_in_wei = document.tip['amount_in_wei'];
    // find the nonce

    web3.eth.getTransactionCount(holding_address, function(error, result) {
      var nonce = result;

      if (!nonce) {
        nonce = 0;
      }
      // find existing balance
      web3.eth.getBalance(holding_address, function(error, result) {
        var balance = result.toNumber();

        if (balance == 0) {
          _alert('You must wait until the senders transaction confirm before claiming this tip.');
          return;
        }
        var rawTx;

        if (is_eth) {
          // send ETH
          rawTx = {
            to: forwarding_address,
            from: holding_address,
            value: amount_in_wei
          };

          web3.eth.estimateGas(rawTx, function(err, gasLimit) {
            rawTx['value'] -= (gasLimit * gas_price_wei); // deduct gas costs from amount to send
            rawTx['gasPrice'] = gas_price_wei;
            rawTx['gasLimit'] = gasLimit;
            sign_and_send(rawTx, success_callback, document.priv_key);
          });
        } else {

          // send ERC20
          var data = token_contract.transfer.getData(forwarding_address, amount_in_wei);

          rawTx = {
            nonce: web3.toHex(nonce),
            to: token_address,
            from: holding_address,
            value: '0x00',
            data: data
          };

          web3.eth.estimateGas(rawTx, function(err, gasLimit) {
            rawTx['gasPrice'] = gas_price_wei;
            rawTx['gasLimit'] = gasLimit;
            var will_fail_at_this_gas_price = (gas_price_wei * gasLimit) > balance;

            if (will_fail_at_this_gas_price) { // adjust if gas prices have increased since this tx was created
              rawTx['gasPrice'] = Math.floor(balance / gasLimit / 10 ** 9);
            }
            sign_and_send(rawTx, success_callback, document.priv_key);
          });
        }
      });
    });
  });
});