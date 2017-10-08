
import React from 'react'
import {generate} from 'shortid'
import {Col, Row, Input, Icon, Tooltip, Spin} from  'antd'
import _ from 'lodash'
import classnames from 'classnames'
import moment from 'moment'
import './sftp.styl'

const {getGlobal} = window
const fs = getGlobal('fs')
const sorter = (a, b) => {
  let aa = (a.isDirectory ? 0 : 1) + a.name
  let bb = (b.isDirectory ? 0 : 1) + b.name
  return bb > aa ? -1 : 1
}
const getOtherType = type => {
  return type === 'remote'
    ? 'local'
    : 'remote'
}
export default class Sftp extends React.Component {

  constructor(props) {
    super(props)
    this.state = {
      id: props.id || generate(),
      local: [],
      remote: [],
      localLoading: false,
      remoteLoading: false,
      localPath: '',
      remotePath: ''
    }
  }

  componentWillMount() {
    this.initData()
  }

  initData = () => {
    this.remoteList()
    this.localList()
  }

  remoteList = async () => {
    let Client = getGlobal('Ftp')
    if (!Client) return

    let sftp = new Client()
    let {tab} = this.props
    let {username} = tab
    let remotePath = username === 'root'
      ? '/root'
      : `/home/${tab.username}`
    let noPathInit = this.state.remotePath
    if (noPathInit) {
      remotePath = noPathInit
    }
    this.setState({
      remoteLoading: true
    })
    try {
      await sftp.connect(tab)
      let remote = await sftp.list(remotePath)
      this.sftp = sftp
      remote = remote.map(r => {
        return {
          ..._.pick(r, ['name', 'size', 'accessTime', 'modifyTime']),
          isDirectory: r.type === 'd',
          type: 'remote'
        }
      }).sort(sorter)
      let update = {
        remote,
        remoteLoading: false
      }
      if (!noPathInit) {
        update.remotePath = remotePath
        update.remotePathTemp = remotePath
      }
      this.setState(update)
    } catch(e) {
      console.log(e.stack)
      this.setState({
        remoteLoading: false
      })
    }
  }

  localList = async () => {
    if (!fs) return
    this.setState({
      localLoading: true
    })
    try {
      let resolve = getGlobal('resolve')
      let noPathInit = this.state.localPath
      let localPath = noPathInit || getGlobal('homeOrtmp')
      let locals = await fs.readdirAsync(localPath)
      let local = []
      for(let name of locals) {
        let stat = await fs.statAsync(resolve(localPath, name))
        local.push({
          name,
          size: stat.size,
          accessTime: stat.atime,
          modifyTime: stat.mtime,
          type: 'local',
          isDirectory: stat.isDirectory()
        })
      }
      local.sort(sorter)
      let update = {
        local,
        localLoading: false
      }
      if (!noPathInit) {
        update.localPath = localPath
        update.localPathTemp = localPath
      }
      this.setState(update)
    } catch(e) {
      console.log(e.stack)
      this.setState({
        localLoading: false
      })
    }

  }

  timers = {}

  transferOrEnterDirectory = (item, e) => {
    if (item.isDirectory) {
      e.stopPropagation()
      let {type, name} = item
      let resolve = getGlobal('resolve')
      let n = `${type}Path`
      let path = this.state[n]
      let np = resolve(path, name)
      this.setState({
        [n]: np
      }, this[`${type}List`])
    } else {
      this.transfer(item, e)
    }
  }

  onChange = (e, prop) => {
    this.setState({
      [prop]: e.target.value
    })
  }

  transfer = async (item) => {
    let {type, name} = item
    let otherType = getOtherType(type)
    let path = this.state[`${type}Path`]
    let rPAth = this.state.remotePath
    let lPath = this.state.localPath
    let resolve = getGlobal('resolve')
    let f = resolve(path, name)
    let fr = resolve(rPAth, name)
    let fl = resolve(lPath, name)
    if (type === 'remote') {
      await this.sftp.getFile(f, fl)
    } else {
      await this.sftp.put(f, fr)
    }
    await this[`${otherType}List`]()
  }

  onGoto = (type) => {
    let n = `${type}Path`
    let nt = n + 'Temp'
    this.setState({
      [n]: this.state[nt]
    }, this[`${type}List`])
  }

  goParent = (type) => {
    let resolve = getGlobal('resolve')
    let n = `${type}Path`
    let p = this.state[n]
    let np = resolve(p, '..')
    if (np !== p) {
      this.setState({
        [n]: np,
        [n + 'Temp']: np
      }, this[`${type}List`])
    }
  }

  renderItem = (item, i, type) => {
    let {
      name,
      size,
      isDirectory,
      modifyTime
    } = item
    let cls = classnames('sftp-item', type, {
      directory: isDirectory
    })
    let pm = type === 'remote'
      ? 'left'
      : 'right'
    let title = (
      <div>
        <p>{name}</p>
        <p>modifyTime: {moment(modifyTime).format()}</p>
      </div>
    )
    return (
      <div
        className={cls}
        onDoubleClick={(e) => this.transferOrEnterDirectory(item, e)}
      >
        <Tooltip
          title={title}
          placement={pm}
        >
          <div className="sftp-item-title elli iblock">
            {
              isDirectory
                ? <Icon type="folder" />
                : <Icon type="file" />
            }
            <span className="mg1l">{name}</span>
          </div>
        </Tooltip>
        {
          isDirectory
            ? null
            : <div className="sftp-item-size elli iblock">{size}</div>
        }
        {
          isDirectory
            ? null
            : (
              <Tooltip title="transfer">
                <Icon
                  type={`double-${pm}`}
                  className="transport-icon"
                  onClick={(e) => this.transfer(item, e)}
                />
              </Tooltip>
            )
        }
      </div>
    )
  }

  renderSection(type) {
    let n = `${type}PathTemp`
    let path = this.state[n]
    let arr = this.state[type]
    let loading = this.state[`${type}Loading`]
    let {host, username} = this.props.tab
    let {height} = this.props
    return (
      <Col span={12}>
        <Spin spinning={loading}>
          <div className="pd1 sftp-panel">
            {
              type === 'remote'
                ? (
                  <div className="pd1t pd1x">
                    remote: {username}@{host}
                  </div>
                )
                : (
                  <div className="pd1t pd1x">
                    local
                  </div>
                )
            }
            <div className="pd1y sftp-title-wrap">
              <div className="sftp-title">
                <Input
                  value={path}
                  onChange={e => this.onChange(e, n)}
                  onPressEnter={() => this.onGoto(type)}
                  addonAfter={
                    <Icon
                      type="arrow-right"
                      onClick={() => this.onGoto(type)}
                    />
                  }
                />
              </div>
              <Tooltip
                title="goto parent folder"
                arrowPointAtCenter
              >
                <Icon
                  type="arrow-up"
                  className="sftp-go-parent-icon"
                  onClick={() => this.goParent(type)}
                />
              </Tooltip>
            </div>
            <div
              className="file-list pd1 overscroll-y"
              style={{height: height - 15}}
            >
              {
                arr.map((item, i) => {
                  return this.renderItem(item, i, type)
                })
              }
            </div>
          </div>
        </Spin>
      </Col>
    )
  }

  render() {
    let {id} = this.state
    let {height} = this.props
    return (
      <div className="sftp-wrap overhide" id={id} style={{height}}>
        <Row>
          {this.renderSection('local')}
          {this.renderSection('remote')}
        </Row>
      </div>
    )
  }

}